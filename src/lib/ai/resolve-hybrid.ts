import "server-only";
import { searchSkillsFuzzy, searchSkillsSemantic } from "@/lib/esco/queries";
import { isEmbeddingsConfigured } from "@/lib/flags";
import { embed, chunk } from "./embeddings";
import { extractSkillPhrases } from "./extract-skills";
import type { Locale, Skill } from "@/lib/esco/types";

/**
 * Map a free-text self-description to ESCO skills, zero-Anthropic-cost:
 *
 *   1. extractSkillPhrases (extract-skills.ts) — free-text → canonical skill
 *      PHRASES. This step is NOT optional: "vastasin viiden hengen porukasta"
 *      (no lexical or semantic overlap with any ESCO label on its own) only
 *      resolves correctly once turned into "tiimin johtaminen" first. Skipping
 *      it and matching raw sentences/words directly was tried and regressed —
 *      see git history on this file.
 *   2. Each phrase is searched two ways: trigram similarity (searchSkillsFuzzy,
 *      catches morphological variants) and embedding cosine similarity
 *      (searchSkillsSemantic, catches synonyms). Neither is reliable alone.
 *   3. The two candidate lists are merged by RECIPROCAL RANK FUSION, not by
 *      combining their raw scores — pg_trgm similarity (~0.15-0.5 in this
 *      table, threshold floored in 0008) and embedding cosine similarity (this
 *      model sits ~0.4+ even for unrelated Finnish text, measured in
 *      scripts/probe-embedding-quality.mjs) are different scales entirely,
 *      so `max(trigramScore, embeddingScore)` silently prefers embedding
 *      almost every time regardless of which signal is actually stronger. RRF
 *      uses each signal's RANK within its own list, never its absolute value,
 *      so the scale mismatch can't skew the result.
 */

const TRIGRAM_PER_PHRASE = 8;
const SEMANTIC_PER_PHRASE = 8;
/** Standard RRF damping constant (Cormack et al.) — de-weights rank 1 vs rank 30
 *  gently rather than letting an early rank dominate the sum. */
const RRF_K = 60;

type Candidate = Skill & { conceptUri: string };

export async function resolveHybrid(
  text: string,
  locale: Locale,
  limit = 12
): Promise<Skill[]> {
  const cleaned = text.trim();
  const phrases = await extractSkillPhrases(cleaned, locale, limit);
  if (phrases.length === 0) return [];

  const [trigramRanked, embeddingRanked] = await Promise.all([
    gatherTrigram(phrases, locale),
    gatherSemantic(phrases, locale),
  ]);

  return fuseRRF(trigramRanked, embeddingRanked).slice(0, limit);
}

/** Best trigram match per phrase, deduped by URI (best score kept), then re-sorted for ranking. */
async function gatherTrigram(phrases: string[], locale: Locale): Promise<Candidate[]> {
  const perPhrase = await Promise.all(
    phrases.map((p) => searchSkillsFuzzy(p, locale, TRIGRAM_PER_PHRASE))
  );
  const byUri = new Map<string, Candidate & { similarity: number }>();
  for (const hits of perPhrase) {
    for (const hit of hits) {
      const existing = byUri.get(hit.conceptUri);
      if (!existing || hit.similarity > existing.similarity) byUri.set(hit.conceptUri, hit);
    }
  }
  return Array.from(byUri.values()).sort((a, b) => b.similarity - a.similarity);
}

/** Same idea over embeddings: one batched NVIDIA call for all phrases, then per-phrase RPC lookups. */
async function gatherSemantic(phrases: string[], locale: Locale): Promise<Candidate[]> {
  if (!isEmbeddingsConfigured()) return [];
  try {
    const vectors: number[][] = [];
    for (const batch of chunk(phrases)) vectors.push(...(await embed(batch, "query")));

    const perPhrase = await Promise.all(
      vectors.map((v) => searchSkillsSemantic(v, locale, SEMANTIC_PER_PHRASE))
    );
    const byUri = new Map<string, Candidate & { similarity: number }>();
    for (const hits of perPhrase) {
      for (const hit of hits) {
        const existing = byUri.get(hit.conceptUri);
        if (!existing || hit.similarity > existing.similarity) byUri.set(hit.conceptUri, hit);
      }
    }
    return Array.from(byUri.values()).sort((a, b) => b.similarity - a.similarity);
  } catch {
    return []; // degrades to trigram-only — this stage never errors the caller
  }
}

/** Reciprocal Rank Fusion over two already-rank-ordered (best-first) candidate lists. */
function fuseRRF(listA: Candidate[], listB: Candidate[]): Skill[] {
  const scores = new Map<string, number>();
  const skills = new Map<string, Skill>();
  for (const list of [listA, listB]) {
    list.forEach((c, rank) => {
      scores.set(c.conceptUri, (scores.get(c.conceptUri) ?? 0) + 1 / (RRF_K + rank));
      if (!skills.has(c.conceptUri)) skills.set(c.conceptUri, c);
    });
  }
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([uri]) => skills.get(uri)!);
}
