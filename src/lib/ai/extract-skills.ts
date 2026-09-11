import "server-only";
import type { Locale } from "@/lib/esco/types";

/**
 * The LLM half of AI-assist: turn a person's free-text self-description into a
 * short list of canonical, ESCO-style skill phrases in the active locale. This
 * is the ONLY place that calls a model — the caller (resolve-hybrid.ts) then
 * resolves these phrases to real ESCO skill rows via trigram + embedding
 * search, so the model never invents skill URIs. Swapping models or providers
 * is contained here behind `extractSkillPhrases`.
 *
 * Backend: NVIDIA NIM chat completions (OpenAI-compatible), model
 * moonshotai/kimi-k3. This is the only chat model (of 21 tried on this NVIDIA
 * account's free tier — everything else was either gated 404 or an
 * unresponsive multi-minute reasoning model) that is both reachable and
 * returns in bounded time. That time is still ~20-25s, not fast — callers
 * must show a loading state, this is not a snappy call. No structured-output
 * mode is assumed (unlike the earlier Anthropic version's json_schema
 * output_config); the model is prompted for bare JSON and the response is
 * parsed tolerantly.
 */

const BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.NVIDIA_CHAT_MODEL || "moonshotai/kimi-k3";
/** Observed latency is ~20-25s; this only guards against a stuck request, not normal calls. */
const TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;
/** The free tier 429s two calls made back-to-back (observed directly) — back off before retrying. */
const BASE_DELAY_MS = 3_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class TimeoutError extends Error {}

/**
 * Race a promise against a hard deadline. This is NOT redundant with the
 * AbortController passed into fetch below — observed directly in this app's
 * dev server (a live TCP connection to NVIDIA's endpoint, still open 6+
 * minutes after an "aborted" request): Next.js's fetch patching did not
 * reliably reject on abort. AbortController is kept as best-effort request
 * cancellation, but withDeadline is what actually guarantees this function
 * returns control to its caller within TIMEOUT_MS — it races the CALLER'S
 * wait, independent of whether the underlying connection ever really closes.
 */
async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = `You help a career-guidance app turn a person's free-text description of their work, studies, or everyday experience into a list of professional SKILLS and KNOWLEDGE areas.

Rules:
- Output canonical, generic skill names as they would appear in a skills taxonomy (e.g. "customer service", "project management", "data analysis", "welding") — NOT full sentences, job titles, employer names, or personal details.
- Normalise synonyms and colloquial phrasing into the standard term.
- Infer clearly-implied skills (e.g. "led a team of 5" → "team leadership"; "kept the books" → "bookkeeping"), but do not invent skills the text gives no basis for.
- Return each skill once. Order by how central it is to the description.
- Write every skill in the requested output language.
- Return ONLY a JSON object of the exact shape {"skills": ["...", "..."]}. No other text, no reasoning, no markdown fences.`;

/**
 * Map free text → canonical skill phrases via NVIDIA chat completions. Returns
 * at most `max` phrases. Throws on API/transport error (missing key, timeout,
 * non-2xx after retry) so the caller can fall back; returns `[]` for a
 * genuinely skill-free input or an unparseable response.
 */
export async function extractSkillPhrases(
  text: string,
  locale: Locale,
  max = 12
): Promise<string[]> {
  const cleaned = text.trim();
  if (cleaned.length < 8) return [];

  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set");

  const language = locale === "fi" ? "Finnish" : "English";
  const userContent =
    `Output language: ${language}. Return at most ${max} skills.\n\n` +
    `Description:\n${cleaned}`;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    try {
      return await withDeadline(
        callOnce(key, userContent, max, controller.signal),
        TIMEOUT_MS
      );
    } catch (err) {
      controller.abort(); // best-effort — see withDeadline's comment on why this alone isn't trusted
      lastErr = err;
      if (err instanceof TimeoutError) {
        console.error(
          `extractSkillPhrases: attempt ${attempt}/${MAX_ATTEMPTS} exceeded ${TIMEOUT_MS}ms`
        );
      }
      if ((err as { fatal?: boolean }).fatal) throw err;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function callOnce(
  key: string,
  userContent: string,
  max: number,
  signal: AbortSignal
): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0,
      max_tokens: 1024,
    }),
    signal,
  });

  if (res.status === 429 || res.status >= 500) {
    throw new Error(`retryable ${res.status}: ${await safeText(res)}`);
  }
  if (!res.ok) {
    // 4xx other than 429 — bad key, bad model name. Retrying won't help.
    const detail = await safeText(res);
    throw Object.assign(new Error(`chat completion ${res.status}: ${detail}`), {
      fatal: true,
    });
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") return [];

  const skills = parseSkillsJson(content);
  if (!skills) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    if (typeof s !== "string") continue;
    const phrase = s.trim();
    const dedupeKey = phrase.toLowerCase();
    if (phrase.length < 2 || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(phrase);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The model is prompted for bare JSON but isn't schema-constrained the way the
 * earlier Anthropic output_config was, so tolerate stray text/markdown fences
 * around the object.
 */
function parseSkillsJson(content: string): unknown[] | null {
  const trimmed = content.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  try {
    const obj = JSON.parse(match ? match[0] : trimmed) as { skills?: unknown };
    return Array.isArray(obj.skills) ? obj.skills : null;
  } catch {
    return null;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}
