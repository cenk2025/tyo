import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/flags";
import { DISCOVERY_CATEGORIES } from "./discovery-categories";
import type {
  Locale,
  Occupation,
  OccupationSkill,
  Skill,
  RelationType,
} from "./types";

/**
 * ALL ESCO read logic lives in this file. Every query is locale-aware (Finnish
 * label falls back to English when empty) and defensive: if Supabase isn't
 * configured yet, queries return empty results so the UI shows empty states
 * instead of crashing.
 *
 * If the real ESCO column names differ from the assumed schema, this is the
 * only file you need to touch.
 */

const OCC_COLS =
  "concept_uri, code, isco_group, preferred_label_en, preferred_label_fi, alt_labels_en, alt_labels_fi, description_en, description_fi, green_share";
const SKILL_COLS =
  "concept_uri, skill_type, reuse_level, preferred_label_en, preferred_label_fi, alt_labels_en, alt_labels_fi, description_en, description_fi, is_green, is_digital";

type Row = Record<string, unknown>;

function pick(row: Row, fi: string, en: string, locale: Locale): string {
  const primary = (locale === "fi" ? row[fi] : row[en]) as string | null;
  const fallback = (locale === "fi" ? row[en] : row[fi]) as string | null;
  return (primary && primary.trim()) || (fallback && fallback.trim()) || "";
}

function pickNullable(
  row: Row,
  fi: string,
  en: string,
  locale: Locale
): string | null {
  const v = pick(row, fi, en, locale);
  return v || null;
}

function toOccupation(row: Row, locale: Locale): Occupation {
  return {
    conceptUri: String(row.concept_uri),
    code: String(row.code ?? ""),
    iscoGroup: (row.isco_group as string) ?? null,
    label: pick(row, "preferred_label_fi", "preferred_label_en", locale),
    description: pickNullable(row, "description_fi", "description_en", locale),
    greenShare: row.green_share != null ? Number(row.green_share) : null,
  };
}

function toSkill(row: Row, locale: Locale): Skill {
  return {
    conceptUri: String(row.concept_uri),
    skillType: (row.skill_type as Skill["skillType"]) ?? null,
    reuseLevel: (row.reuse_level as Skill["reuseLevel"]) ?? null,
    label: pick(row, "preferred_label_fi", "preferred_label_en", locale),
    description: pickNullable(row, "description_fi", "description_en", locale),
    isGreen: Boolean(row.is_green),
    isDigital: Boolean(row.is_digital),
  };
}

/** Fuzzy occupation search (trigram-backed ILIKE across the locale labels). */
export async function searchOccupations(
  query: string,
  locale: Locale,
  limit = 10
): Promise<Occupation[]> {
  if (!isSupabaseConfigured() || query.trim().length < 2) return [];
  try {
    const supabase = await createClient();
    const q = query.trim().replace(/[%,]/g, " ");
    const { data, error } = await supabase
      .from("occupations")
      .select(OCC_COLS)
      .or(
        `preferred_label_${locale}.ilike.%${q}%,alt_labels_${locale}.ilike.%${q}%`
      )
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => toOccupation(r as Row, locale));
  } catch {
    return [];
  }
}

/** Server-side paginated occupation directory. */
export async function listOccupations(
  locale: Locale,
  page = 1,
  pageSize = 20,
  query = ""
): Promise<{ items: Occupation[]; total: number }> {
  if (!isSupabaseConfigured()) return { items: [], total: 0 };
  try {
    const supabase = await createClient();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let qb = supabase
      .from("occupations")
      .select(OCC_COLS, { count: "exact" })
      .order(`preferred_label_${locale}`, { ascending: true, nullsFirst: false })
      .range(from, to);
    if (query.trim().length >= 2) {
      const q = query.trim().replace(/[%,]/g, " ");
      qb = qb.or(
        `preferred_label_${locale}.ilike.%${q}%,alt_labels_${locale}.ilike.%${q}%`
      );
    }
    const { data, error, count } = await qb;
    if (error) throw error;
    return {
      items: (data ?? []).map((r) => toOccupation(r as Row, locale)),
      total: count ?? 0,
    };
  } catch {
    return { items: [], total: 0 };
  }
}

export async function getOccupationByCode(
  code: string,
  locale: Locale
): Promise<Occupation | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("occupations")
      .select(OCC_COLS)
      .eq("code", code)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toOccupation(data as Row, locale) : null;
  } catch {
    return null;
  }
}

export async function getOccupationByUri(
  uri: string,
  locale: Locale
): Promise<Occupation | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("occupations")
      .select(OCC_COLS)
      .eq("concept_uri", uri)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toOccupation(data as Row, locale) : null;
  } catch {
    return null;
  }
}

/** All skills (essential + optional) required by an occupation. */
export async function getOccupationSkills(
  occupationUri: string,
  locale: Locale
): Promise<OccupationSkill[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("occupation_skill_relations")
      .select(`relation_type, skills:skill_uri (${SKILL_COLS})`)
      .eq("occupation_uri", occupationUri);
    if (error) throw error;
    return (data ?? [])
      .map((row: Row) => {
        const skillRow = (row.skills as Row) ?? null;
        if (!skillRow) return null;
        return {
          ...toSkill(skillRow, locale),
          relationType: (row.relation_type as RelationType) ?? "optional",
        } satisfies OccupationSkill;
      })
      .filter((s): s is OccupationSkill => s !== null && s.label !== "");
  } catch {
    return [];
  }
}

/** Fuzzy skill search for onboarding / "add skill" flows. */
export async function searchSkills(
  query: string,
  locale: Locale,
  limit = 10
): Promise<Skill[]> {
  if (!isSupabaseConfigured() || query.trim().length < 2) return [];
  try {
    const supabase = await createClient();
    const q = query.trim().replace(/[%,]/g, " ");
    const { data, error } = await supabase
      .from("skills")
      .select(SKILL_COLS)
      .or(
        `preferred_label_${locale}.ilike.%${q}%,alt_labels_${locale}.ilike.%${q}%`
      )
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => toSkill(r as Row, locale));
  } catch {
    return [];
  }
}

/**
 * Fuzzy skill search by trigram SIMILARITY rather than substring containment —
 * finds candidates ILIKE would miss (e.g. "tiiminjohtaminen" vs ESCO's "johtaa
 * tiimiä"). Used to build the candidate pool for AI-assist's Claude-grounded
 * resolver (resolve-skills.ts); each result carries its similarity score so
 * the caller can rank/cap without a second query.
 */
export async function searchSkillsFuzzy(
  query: string,
  locale: Locale,
  limit = 8
): Promise<(Skill & { similarity: number })[]> {
  if (!isSupabaseConfigured() || query.trim().length < 2) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("search_skills_fuzzy", {
      p_query: query.trim(),
      p_locale: locale,
      p_limit: limit,
    });
    if (error) throw error;
    return ((data ?? []) as Row[]).map((r) => ({
      ...toSkill(r, locale),
      similarity: Number(r.similarity ?? 0),
    }));
  } catch {
    return [];
  }
}

/**
 * Semantic skill search via precomputed embeddings (0007 migration's
 * match_skills_semantic RPC). `queryEmbedding` must come from the same model
 * that produced `skills.embedding_fi` — see src/lib/ai/embeddings.ts.
 */
export async function searchSkillsSemantic(
  queryEmbedding: number[],
  locale: Locale,
  limit = 15,
  minSimilarity = 0
): Promise<(Skill & { similarity: number })[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("match_skills_semantic", {
      p_embedding: `[${queryEmbedding.join(",")}]`,
      p_limit: limit,
      p_min_similarity: minSimilarity,
    });
    if (error) throw error;
    return ((data ?? []) as Row[]).map((r) => ({
      ...toSkill(r, locale),
      similarity: Number(r.similarity ?? 0),
    }));
  } catch {
    return [];
  }
}

/** Curated transversal skills grid (onboarding step 2). */
export async function getTransversalSkills(
  locale: Locale,
  limit = 18
): Promise<Skill[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("skills")
      .select(SKILL_COLS)
      .eq("reuse_level", "transversal")
      .order(`preferred_label_${locale}`, { ascending: true, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => toSkill(r as Row, locale));
  } catch {
    return [];
  }
}

export async function getSkillByUri(
  uri: string,
  locale: Locale
): Promise<Skill | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("skills")
      .select(SKILL_COLS)
      .eq("concept_uri", uri)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toSkill(data as Row, locale) : null;
  } catch {
    return null;
  }
}

/** Resolve a list of skill URIs into localized Skill objects (for user profiles). */
export async function getSkillsByUris(
  uris: string[],
  locale: Locale
): Promise<Skill[]> {
  if (!isSupabaseConfigured() || uris.length === 0) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("skills")
      .select(SKILL_COLS)
      .in("concept_uri", uris);
    if (error) throw error;
    return (data ?? []).map((r) => toSkill(r as Row, locale));
  } catch {
    return [];
  }
}

/** Occupations that require a given skill, split by essential/optional. */
export async function getOccupationsForSkill(
  skillUri: string,
  locale: Locale,
  limit = 40
): Promise<{ essential: Occupation[]; optional: Occupation[] }> {
  if (!isSupabaseConfigured()) return { essential: [], optional: [] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("occupation_skill_relations")
      .select(`relation_type, occupations:occupation_uri (${OCC_COLS})`)
      .eq("skill_uri", skillUri)
      .limit(limit);
    if (error) throw error;
    const essential: Occupation[] = [];
    const optional: Occupation[] = [];
    for (const row of (data ?? []) as Row[]) {
      const occRow = row.occupations as Row | null;
      if (!occRow) continue;
      const occ = toOccupation(occRow, locale);
      if (!occ.label) continue;
      if (row.relation_type === "essential") essential.push(occ);
      else optional.push(occ);
    }
    return { essential, optional };
  } catch {
    return { essential: [], optional: [] };
  }
}

/**
 * Curated skill groups for onboarding's occupation-less discovery branch
 * (see discovery-categories.ts for what's in each group and why). Resolves
 * the hand-picked URIs to real, localized Skill rows in one query.
 */
export async function getDiscoverySkills(
  locale: Locale
): Promise<{ category: string; skills: Skill[] }[]> {
  const allUris = DISCOVERY_CATEGORIES.flatMap((c) => c.skillUris);
  const resolved = await getSkillsByUris(allUris, locale);
  const byUri = new Map(resolved.map((s) => [s.conceptUri, s]));
  return DISCOVERY_CATEGORIES.map((c) => ({
    category: c.key,
    skills: c.skillUris
      .map((u) => byUri.get(u))
      .filter((s): s is Skill => Boolean(s)),
  })).filter((c) => c.skills.length > 0);
}

/**
 * Suggest occupations from a set of skills BEFORE they're saved to a user
 * profile — used by onboarding's discovery branch to show "based on what you
 * picked" inspiration while the wizard is still in local state, with no
 * account-side data to run the real match_occupations RPC against.
 *
 * This is deliberately a much cruder heuristic than that RPC (essential
 * relations weighted 2x, optional 1x, summed across all picked skills) — it
 * only needs to surface plausible, inspiring candidates, not rank precisely.
 * Once the profile is saved, the dashboard's real matches take over.
 */
export async function previewOccupationsForSkills(
  skillUris: string[],
  locale: Locale,
  limit = 6
): Promise<Occupation[]> {
  if (!isSupabaseConfigured() || skillUris.length === 0) return [];
  try {
    const perSkill = await Promise.all(
      skillUris.map((uri) => getOccupationsForSkill(uri, locale, 60))
    );
    const scored = new Map<string, { occupation: Occupation; score: number }>();
    for (const { essential, optional } of perSkill) {
      for (const occ of essential) {
        const prev = scored.get(occ.conceptUri);
        scored.set(occ.conceptUri, { occupation: occ, score: (prev?.score ?? 0) + 2 });
      }
      for (const occ of optional) {
        const prev = scored.get(occ.conceptUri);
        scored.set(occ.conceptUri, { occupation: occ, score: (prev?.score ?? 0) + 1 });
      }
    }
    return Array.from(scored.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.occupation);
  } catch {
    return [];
  }
}
