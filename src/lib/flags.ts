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
 * True when a real Anthropic API key is present (server-only). When false, the
 * AI-assist free-text mapping falls back to the trigram keyword heuristic — so
 * the feature degrades gracefully instead of erroring.
 */
export function isAiConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return Boolean(key && key.trim() && !key.includes("your-anthropic"));
}
