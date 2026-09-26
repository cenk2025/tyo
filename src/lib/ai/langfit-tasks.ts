import "server-only";
import { z } from "zod";
import { CEFR_LEVELS, LANGUAGES, RATIONALE_TYPES, REQUIRED_BY } from "@/features/langfit/types";
import type { LangTask } from "@/features/langfit/types";
import type { Locale } from "@/lib/esco/types";

/**
 * LangFit's only model call: split a job ad into 5-10 concrete work situations
 * and suggest a language requirement for each. It returns structured rows and
 * nothing else — the posting text, rationale note and plan are rendered from
 * the rows the employer validates (features/langfit/outputs.ts), never by the
 * model.
 *
 * Same backend as extract-skills.ts (NVIDIA NIM, OpenAI-compatible). DEMO
 * ONLY: NVIDIA's API trial terms don't allow production use. The output is
 * larger than skill extraction's, so the deadline is longer and there's one
 * retry, not three; on failure the caller falls back to manual entry.
 */

const BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.NVIDIA_CHAT_MODEL || "moonshotai/kimi-k3";
const TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3_000;

const SYSTEM_PROMPT = `You help an employer in Finland set fair, job-based language requirements. You describe the JOB, never people: do not assess, rank or mention applicants.

Split the job ad into 5 to 10 concrete work situations (tasks). For each task suggest:
- language: "fi", "sv" or "en" — the language the task is actually carried out in
- CEFR level (A1..C2) for listening, reading, speaking, writing, or null when that skill isn't used in the task. Choose the LOWEST level that lets the task be done safely.
- requiredBy: "day1", "m6" or "m12" — prefer m6/m12 when the person can learn on the job with support
- rationaleType: "customer_work", "patient_safety", "official_responsibility", "legislation" or "none" when there's no job-based reason
- rationale: one short sentence explaining why, grounded in the ad
- englishSufficient: true when the task could reasonably be done in English

An ad asking for "fluent" or "native" Finnish is not itself a reason; judge each task on its own.

Return ONLY a JSON object: {"tasks":[{"description":"...","language":"fi","listening":"B1","reading":null,"speaking":"B1","writing":null,"requiredBy":"m6","rationaleType":"customer_work","rationale":"...","englishSufficient":false}]}. No other text, no markdown fences.`;

const level = z.enum(CEFR_LEVELS).nullable().catch(null);
const RowSchema = z.object({
  description: z.string().trim().min(2).max(300),
  language: z.enum(LANGUAGES).catch("fi"),
  listening: level,
  reading: level,
  speaking: level,
  writing: level,
  requiredBy: z.enum(REQUIRED_BY).catch("day1"),
  rationaleType: z.enum(RATIONALE_TYPES).catch("none"),
  rationale: z.string().max(600).catch(""),
  englishSufficient: z.boolean().catch(false),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Throws on transport/API failure so the caller can fall back to manual entry. */
export async function suggestLangfitTasks(
  adText: string,
  locale: Locale
): Promise<Omit<LangTask, "id">[]> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set");
  const language = locale === "fi" ? "Finnish" : "English";
  const userContent = `Write descriptions and rationales in ${language}.\n\nJob ad:\n${adText.trim().slice(0, 6000)}`;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await withDeadline(callOnce(key, userContent), TIMEOUT_MS);
    } catch (err) {
      lastErr = err;
      if ((err as { fatal?: boolean }).fatal || attempt === MAX_ATTEMPTS) break;
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** See extract-skills.ts: Next's patched fetch doesn't reliably reject on abort. */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

async function callOnce(key: string, userContent: string): Promise<Omit<LangTask, "id">[]> {
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
      max_tokens: 3000,
    }),
  });
  if (res.status === 429 || res.status >= 500) throw new Error(`retryable ${res.status}`);
  if (!res.ok) throw Object.assign(new Error(`chat completion ${res.status}`), { fatal: true });

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("empty completion");

  const match = content.trim().match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : content) as { tasks?: unknown };
  if (!Array.isArray(parsed.tasks)) throw new Error("no tasks array");

  const rows: Omit<LangTask, "id">[] = [];
  for (const raw of parsed.tasks.slice(0, 10)) {
    const r = RowSchema.safeParse(raw);
    if (!r.success) continue;
    const v = r.data;
    rows.push({
      description: v.description,
      language: v.language,
      levels: { listening: v.listening, reading: v.reading, speaking: v.speaking, writing: v.writing },
      requiredBy: v.requiredBy,
      rationaleType: v.rationaleType,
      rationale: v.rationale,
      englishSufficient: v.englishSufficient,
      origin: "ai",
      validated: false,
      locked: false,
    });
  }
  if (rows.length === 0) throw new Error("no usable tasks");
  return rows;
}
