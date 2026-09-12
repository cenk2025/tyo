/** Feature flags, read from public env. Keep flag reads centralized here. */
export const flags = {
  aiAssist: process.env.NEXT_PUBLIC_FEATURE_AI_ASSIST === "true",
} as const;

/** True when Supabase env points at a real project (not the scaffold placeholder). */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && anon && !url.includes("your-project") && anon !== "your-anon-key");
}

/**
 * True when a NVIDIA key is present (server-only). It powers both halves of
 * AI-assist: phrase extraction (chat) and semantic skill lookup (embeddings).
 * When false, resolution falls back to trigram search only — same contract,
 * lower recall.
 */
export function isEmbeddingsConfigured(): boolean {
  const key = process.env.NVIDIA_API_KEY;
  return Boolean(key && key.trim() && key.startsWith("nvapi-"));
}
