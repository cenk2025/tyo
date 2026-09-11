import "server-only";

/**
 * NVIDIA NIM embedding client (OpenAI-compatible endpoint).
 *
 * Used by the semantic half of AI-assist: free-text skill phrases and ESCO
 * skill rows are embedded into the same vector space, so "kassatyö" can find
 * "handle cash transactions" without sharing a single trigram. Finnish
 * morphology is exactly where the old ILIKE heuristic breaks down.
 *
 * Everything provider-specific is contained here. Swapping to another
 * OpenAI-compatible embedding provider means changing BASE_URL and MODEL only.
 */

const BASE_URL =
  process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.NVIDIA_EMBED_MODEL || "nvidia/nemotron-3-embed-1b";

/**
 * Asymmetric embedding models encode a short query and a long document
 * differently. Getting this wrong silently degrades recall, so it is explicit
 * at every call site rather than defaulted.
 */
export type InputType = "query" | "passage";

/** NVIDIA's free tier is rate-limited and periodically returns 503. */
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 700;
/** Endpoint accepts batches; keep them modest so one failure costs little. */
export const MAX_BATCH = 32;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Embed a batch of texts. Throws on unrecoverable failure so callers can fall
 * back to the trigram path — this feature degrades, it never errors at the UI.
 */
export async function embed(
  texts: string[],
  inputType: InputType
): Promise<number[][]> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set");

  const input = texts.map((t) => t.trim()).filter((t) => t.length > 0);
  if (input.length === 0) return [];
  if (input.length > MAX_BATCH) {
    throw new Error(`batch of ${input.length} exceeds MAX_BATCH ${MAX_BATCH}`);
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          input,
          input_type: inputType,
          encoding_format: "float",
          truncate: "END",
        }),
      });

      if (res.status === 429 || res.status >= 500) {
        // Transient: rate limit or the free endpoint being overloaded.
        throw new Error(`retryable ${res.status}: ${await safeText(res)}`);
      }
      if (!res.ok) {
        // 4xx other than 429 — bad key, bad model name. Retrying won't help.
        const detail = await safeText(res);
        throw Object.assign(new Error(`embeddings ${res.status}: ${detail}`), {
          fatal: true,
        });
      }

      const json = (await res.json()) as {
        data?: { index: number; embedding: number[] }[];
      };
      if (!json.data || json.data.length !== input.length) {
        throw new Error("embeddings response missing or short `data`");
      }
      // The API may reorder; `index` is authoritative.
      const out: number[][] = new Array(input.length);
      for (const row of json.data) out[row.index] = row.embedding;
      return out;
    } catch (err) {
      lastErr = err;
      if ((err as { fatal?: boolean }).fatal) throw err;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Convenience wrapper for the single-text case (the query side). */
export async function embedOne(
  text: string,
  inputType: InputType
): Promise<number[] | null> {
  const [v] = await embed([text], inputType);
  return v ?? null;
}

/** Split into MAX_BATCH-sized chunks; used by the backfill script. */
export function chunk<T>(items: T[], size = MAX_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}
