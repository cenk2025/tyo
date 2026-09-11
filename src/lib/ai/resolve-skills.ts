import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { searchSkillsFuzzy } from "@/lib/esco/queries";
import type { Locale, Skill } from "@/lib/esco/types";

/**
 * Ground Claude's canonical skill phrases in real ESCO rows — by having Claude
 * pick them, not by fuzzy-search ranking.
 *
 * Replaces the embedding-similarity approach (see git history / 0007 migration):
 * nvidia/nemotron-3-embed-1b scored 2/5 and the next-best reachable model 3/5
 * on scripts/probe-embedding-quality.mjs — not reliable enough to rank silently.
 *
 * Instead: trigram SIMILARITY search (searchSkillsFuzzy, not the substring
 * ILIKE searchSkills) casts a wide net per phrase — it only needs to get the
 * right answer somewhere in ~8 candidates, not in first place. Claude then
 * picks the genuine matches from that real, DB-verified candidate list. The
 * response schema's `enum` is built from the candidate indices at request
 * time, so the model is structurally unable to return a skill that isn't in
 * the list — no URI can be hallucinated.
 *
 * Throws on API/transport error so the caller can fall back to the plain
 * trigram top-N pick — this stage degrades, it never errors at the UI.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const CANDIDATES_PER_PHRASE = 8;
const MAX_CANDIDATES = 40;

const SYSTEM_PROMPT = `You match a person's described skills to entries from an official skills taxonomy (ESCO).

You are given the person's free-text description, a list of skill phrases already extracted from it, and a numbered candidate list of real taxonomy entries (found by fuzzy text search, so many are irrelevant near-misses).

Return the indices of candidates that genuinely represent a skill the person has, based on the original description. Rules:
- Only select a candidate if the description actually supports it — fuzzy search recall is wide on purpose, most candidates are noise.
- A phrase may match zero, one, or (rarely) more than one candidate; a candidate may cover more than one phrase — select each qualifying candidate once.
- When two candidates are near-duplicates of the same skill, prefer the one that reads as more specific to what the person described.
- Do not select a candidate just because it shares words with a phrase if the underlying skill differs.`;

type Candidate = Skill & { similarity: number };

function buildSchema(count: number) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      selected_indices: {
        type: "array",
        description: "Indices (0-based) of candidates that are genuine matches.",
        items: count > 0 ? { type: "integer", enum: Array.from({ length: count }, (_, i) => i) } : { type: "integer" },
      },
    },
    required: ["selected_indices"],
  } as const;
}

/** Merge per-phrase fuzzy-search candidates into one deduped, capped list. */
async function gatherCandidates(
  phrases: string[],
  locale: Locale
): Promise<Candidate[]> {
  const perPhrase = await Promise.all(
    phrases.map((p) => searchSkillsFuzzy(p, locale, CANDIDATES_PER_PHRASE))
  );
  const byUri = new Map<string, Candidate>();
  for (const hits of perPhrase) {
    for (const hit of hits) {
      const existing = byUri.get(hit.conceptUri);
      if (!existing || hit.similarity > existing.similarity) {
        byUri.set(hit.conceptUri, hit);
      }
    }
  }
  return Array.from(byUri.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_CANDIDATES);
}

/**
 * Resolve extracted skill phrases to real ESCO skills via wide trigram recall
 * + Claude selection. Returns at most `limit` skills, most-central phrase
 * order isn't preserved (Claude's selection order is).
 */
export async function resolveSkillsWithClaude(
  originalText: string,
  phrases: string[],
  locale: Locale,
  limit = 12
): Promise<Skill[]> {
  if (phrases.length === 0) return [];

  const candidates = await gatherCandidates(phrases, locale);
  if (candidates.length === 0) return [];

  const listText = candidates
    .map((c, i) => `${i}. ${c.label}${c.description ? ` — ${c.description.slice(0, 140)}` : ""}`)
    .join("\n");

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: buildSchema(candidates.length) } },
    messages: [
      {
        role: "user",
        content:
          `Description:\n${originalText}\n\n` +
          `Extracted phrases: ${phrases.join(", ")}\n\n` +
          `Candidates:\n${listText}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") return [];

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  let parsed: { selected_indices?: unknown };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return [];
  }
  if (!parsed || !Array.isArray(parsed.selected_indices)) return [];

  const out: Skill[] = [];
  const seen = new Set<string>();
  for (const idx of parsed.selected_indices) {
    if (typeof idx !== "number" || !Number.isInteger(idx)) continue;
    const candidate = candidates[idx];
    if (!candidate || seen.has(candidate.conceptUri)) continue;
    seen.add(candidate.conceptUri);
    out.push({
      conceptUri: candidate.conceptUri,
      skillType: candidate.skillType,
      reuseLevel: candidate.reuseLevel,
      label: candidate.label,
      description: candidate.description,
      isGreen: candidate.isGreen,
      isDigital: candidate.isDigital,
    });
    if (out.length >= limit) break;
  }
  return out;
}
