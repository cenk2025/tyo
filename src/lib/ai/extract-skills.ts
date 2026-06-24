import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Locale } from "@/lib/esco/types";

/**
 * The LLM half of AI-assist: turn a person's free-text self-description into a
 * short list of canonical, ESCO-style skill phrases in the active locale. This
 * is the ONLY place that calls a model — the caller (analyze-free-text.ts) then
 * resolves these phrases to real ESCO skill rows by fuzzy-searching the DB, so
 * the model never invents skill URIs. Swapping models or providers is contained
 * here behind `extractSkillPhrases`.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

const SYSTEM_PROMPT = `You help a career-guidance app turn a person's free-text description of their work, studies, or everyday experience into a list of professional SKILLS and KNOWLEDGE areas.

Rules:
- Output canonical, generic skill names as they would appear in a skills taxonomy (e.g. "customer service", "project management", "data analysis", "welding") — NOT full sentences, job titles, employer names, or personal details.
- Normalise synonyms and colloquial phrasing into the standard term.
- Infer clearly-implied skills (e.g. "led a team of 5" → "team leadership"; "kept the books" → "bookkeeping"), but do not invent skills the text gives no basis for.
- Return each skill once. Order by how central it is to the description.
- Write every skill in the requested output language.`;

/** JSON schema for structured output (a flat array of skill phrases). */
const SKILLS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    skills: {
      type: "array",
      description: "Canonical skill / knowledge phrases, most central first.",
      items: { type: "string" },
    },
  },
  required: ["skills"],
} as const;

/**
 * Map free text → canonical skill phrases via Claude. Returns at most `max`
 * phrases. Throws on API/transport error so the caller can fall back; returns
 * `[]` for a refusal or genuinely skill-free input.
 */
export async function extractSkillPhrases(
  text: string,
  locale: Locale,
  max = 12
): Promise<string[]> {
  const cleaned = text.trim();
  if (cleaned.length < 8) return [];

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const language = locale === "fi" ? "Finnish" : "English";

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: SKILLS_SCHEMA } },
    messages: [
      {
        role: "user",
        content:
          `Output language: ${language}. Return at most ${max} skills.\n\n` +
          `Description:\n${cleaned}`,
      },
    ],
  });

  // Safety classifiers may decline — check before reading content.
  if (response.stop_reason === "refusal") return [];

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  let parsed: { skills?: unknown };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return [];
  }
  if (!parsed || !Array.isArray(parsed.skills)) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of parsed.skills) {
    if (typeof s !== "string") continue;
    const phrase = s.trim();
    const key = phrase.toLowerCase();
    if (phrase.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length >= max) break;
  }
  return out;
}
