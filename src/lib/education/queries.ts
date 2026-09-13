import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/flags";
import type { Locale, Occupation, Skill } from "@/lib/esco/types";
import type { EducationProgram, ProgramMatch } from "./types";

/**
 * ALL reads of the ePerusteet-sourced qualification tables live here, mirroring
 * lib/esco/queries.ts: locale-aware, and defensive enough that an unconfigured
 * or failing Supabase yields an empty result rather than a thrown error, so
 * pages fall back to their empty states.
 *
 * The link tables these read are built offline by
 * scripts/import-education-programs.mjs — nothing here calls an external API.
 */

const PROGRAM_COLS = "id, koulutustyyppi, name_fi, name_en, name_sv, diaarinumero";

type Row = Record<string, unknown>;

function pickLabel(row: Row, locale: Locale): string {
  const primary = (locale === "fi" ? row.name_fi : row.name_en) as string | null;
  const fallback = (locale === "fi" ? row.name_en : row.name_fi) as string | null;
  return (primary && primary.trim()) || (fallback && fallback.trim()) || "";
}

function toProgram(row: Row, locale: Locale): EducationProgram {
  return {
    id: Number(row.id),
    koulutustyyppi: String(row.koulutustyyppi ?? ""),
    label: pickLabel(row, locale),
    diaarinumero: (row.diaarinumero as string) ?? null,
  };
}

/**
 * ePerusteet publishes each qualification once per revision, as separate rows
 * with separate ids. "Ajoneuvoalan perustutkinto" appears twice, and a user
 * shown both sees the same qualification listed twice for no reason.
 *
 * The dedupe key is name + type, NOT diaarinumero: a revision is issued with a
 * new registry number, so diaarinumero distinguishes versions rather than
 * identifying the qualification across them. Of the versions, the one whose
 * match is strongest is kept.
 */
function dedupeVersions<T extends ProgramMatch>(matches: T[]): T[] {
  const best = new Map<string, T>();
  for (const m of matches) {
    const key = m.koulutustyyppi + "::" + m.label.toLowerCase();
    const prev = best.get(key);
    if (!prev) {
      best.set(key, m);
      continue;
    }
    const covered = m.coveredSkills ?? 0;
    const prevCovered = prev.coveredSkills ?? 0;
    if (covered > prevCovered || (covered === prevCovered && m.similarity > prev.similarity)) {
      best.set(key, m);
    }
  }
  return Array.from(best.values());
}

/**
 * Qualifications whose official degree titles map to this occupation, i.e. the
 * "which Finnish qualification leads to this job" question.
 */
export async function getProgramsForOccupation(
  occupationUri: string,
  locale: Locale,
  limit = 6
): Promise<ProgramMatch[]> {
  if (!isSupabaseConfigured() || !occupationUri) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("education_program_occupations")
      .select(`similarity, education_programs!inner(${PROGRAM_COLS})`)
      .eq("occupation_uri", occupationUri)
      .order("similarity", { ascending: false });
    if (error) throw error;

    const matches = (data ?? []).map((r) => {
      const row = r as Row;
      return {
        ...toProgram(row.education_programs as Row, locale),
        similarity: Number(row.similarity ?? 0),
      };
    });
    return dedupeVersions(matches)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Qualifications that cover the given skills: the gap-to-training bridge.
 * Ranked by how many of the asked-about skills a qualification covers before
 * how closely it covers any one of them, because "covers 4 of your 6 gaps" is
 * more useful than "covers 1, but very closely".
 */
export async function getProgramsForSkills(
  skillUris: string[],
  locale: Locale,
  limit = 5
): Promise<ProgramMatch[]> {
  if (!isSupabaseConfigured() || skillUris.length === 0) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("education_program_skills")
      .select(`skill_uri, similarity, education_programs!inner(${PROGRAM_COLS})`)
      .in("skill_uri", skillUris);
    if (error) throw error;

    const byProgram = new Map<number, ProgramMatch & { seen: Set<string> }>();
    for (const r of data ?? []) {
      const row = r as Row;
      const program = toProgram(row.education_programs as Row, locale);
      const similarity = Number(row.similarity ?? 0);
      const existing = byProgram.get(program.id);
      if (existing) {
        existing.seen.add(String(row.skill_uri));
        existing.similarity = Math.max(existing.similarity, similarity);
      } else {
        byProgram.set(program.id, {
          ...program,
          similarity,
          coveredSkills: 0,
          seen: new Set([String(row.skill_uri)]),
        });
      }
    }

    const matches: ProgramMatch[] = Array.from(byProgram.values()).map((m) => ({
      id: m.id,
      koulutustyyppi: m.koulutustyyppi,
      label: m.label,
      diaarinumero: m.diaarinumero,
      similarity: m.similarity,
      coveredSkills: m.seen.size,
    }));
    return dedupeVersions(matches)
      .sort(
        (a, b) =>
          (b.coveredSkills ?? 0) - (a.coveredSkills ?? 0) || b.similarity - a.similarity
      )
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** One qualification, or null when the id is unknown. */
export async function getProgramById(
  id: number,
  locale: Locale
): Promise<EducationProgram | null> {
  if (!isSupabaseConfigured() || !Number.isFinite(id)) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("education_programs")
      .select(PROGRAM_COLS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toProgram(data as Row, locale) : null;
  } catch {
    return null;
  }
}

/** The ESCO skills this qualification was matched to, strongest first. */
export async function getProgramSkills(
  id: number,
  locale: Locale
): Promise<Skill[]> {
  if (!isSupabaseConfigured() || !Number.isFinite(id)) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("education_program_skills")
      .select(
        "similarity, skills!inner(concept_uri, skill_type, reuse_level, preferred_label_en, preferred_label_fi, description_en, description_fi, is_green, is_digital)"
      )
      .eq("program_id", id)
      .order("similarity", { ascending: false });
    if (error) throw error;

    return (data ?? []).map((r) => {
      const s = (r as Row).skills as Row;
      const label =
        (locale === "fi" ? s.preferred_label_fi : s.preferred_label_en) ||
        (locale === "fi" ? s.preferred_label_en : s.preferred_label_fi);
      const description =
        (locale === "fi" ? s.description_fi : s.description_en) ||
        (locale === "fi" ? s.description_en : s.description_fi);
      return {
        conceptUri: String(s.concept_uri),
        skillType: (s.skill_type as Skill["skillType"]) ?? null,
        reuseLevel: (s.reuse_level as Skill["reuseLevel"]) ?? null,
        label: String(label ?? ""),
        description: (description as string) ?? null,
        isGreen: Boolean(s.is_green),
        isDigital: Boolean(s.is_digital),
      };
    });
  } catch {
    return [];
  }
}

/** The ESCO occupations this qualification's degree titles map to. */
export async function getProgramOccupations(
  id: number,
  locale: Locale
): Promise<Occupation[]> {
  if (!isSupabaseConfigured() || !Number.isFinite(id)) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("education_program_occupations")
      .select(
        "similarity, occupations!inner(concept_uri, code, isco_group, preferred_label_en, preferred_label_fi, description_en, description_fi, green_share)"
      )
      .eq("program_id", id)
      .order("similarity", { ascending: false });
    if (error) throw error;

    const seen = new Set<string>();
    const out: Occupation[] = [];
    for (const r of data ?? []) {
      const o = (r as Row).occupations as Row;
      const uri = String(o.concept_uri);
      if (seen.has(uri)) continue;
      seen.add(uri);
      const label =
        (locale === "fi" ? o.preferred_label_fi : o.preferred_label_en) ||
        (locale === "fi" ? o.preferred_label_en : o.preferred_label_fi);
      const description =
        (locale === "fi" ? o.description_fi : o.description_en) ||
        (locale === "fi" ? o.description_en : o.description_fi);
      out.push({
        conceptUri: uri,
        code: String(o.code ?? ""),
        iscoGroup: (o.isco_group as string) ?? null,
        label: String(label ?? ""),
        description: (description as string) ?? null,
        greenShare: o.green_share != null ? Number(o.green_share) : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}
