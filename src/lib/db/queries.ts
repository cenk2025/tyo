import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/flags";
import { getSkillsByUris, getOccupationByUri } from "@/lib/esco/queries";
import type { Locale, Skill, Occupation } from "@/lib/esco/types";
import type {
  UserProfile,
  SkillSource,
  LearningStatus,
  MatchSnapshotRow,
} from "./types";

/** Reads of the current user's saved data. All RLS-scoped to auth.uid(). */

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    return (data as UserProfile) ?? null;
  } catch {
    return null;
  }
}

export async function getUserSkillUris(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_skills")
      .select("skill_uri")
      .eq("user_id", userId);
    return (data ?? []).map((r) => r.skill_uri as string);
  } catch {
    return [];
  }
}

export interface UserSkill extends Skill {
  source: SkillSource | null;
}

export async function getUserSkills(
  userId: string,
  locale: Locale
): Promise<UserSkill[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_skills")
      .select("skill_uri, source")
      .eq("user_id", userId);
    const rows = data ?? [];
    const sourceByUri = new Map(
      rows.map((r) => [r.skill_uri as string, r.source as SkillSource | null])
    );
    const skills = await getSkillsByUris(
      rows.map((r) => r.skill_uri as string),
      locale
    );
    return skills.map((s) => ({ ...s, source: sourceByUri.get(s.conceptUri) ?? null }));
  } catch {
    return [];
  }
}

export async function getUserTargetUris(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_target_occupations")
      .select("occupation_uri")
      .eq("user_id", userId);
    return (data ?? []).map((r) => r.occupation_uri as string);
  } catch {
    return [];
  }
}

export async function getUserTargetOccupations(
  userId: string,
  locale: Locale
): Promise<Occupation[]> {
  const uris = await getUserTargetUris(userId);
  const occs = await Promise.all(uris.map((uri) => getOccupationByUri(uri, locale)));
  return occs.filter((o): o is Occupation => o !== null);
}

export interface LearningItem extends Skill {
  status: LearningStatus;
}

export async function getLearningList(
  userId: string,
  locale: Locale
): Promise<LearningItem[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_learning_list")
      .select("skill_uri, status")
      .eq("user_id", userId);
    const rows = data ?? [];
    const statusByUri = new Map(
      rows.map((r) => [r.skill_uri as string, r.status as LearningStatus])
    );
    const skills = await getSkillsByUris(
      rows.map((r) => r.skill_uri as string),
      locale
    );
    return skills.map((s) => ({
      ...s,
      status: statusByUri.get(s.conceptUri) ?? "planned",
    }));
  } catch {
    return [];
  }
}

export async function getMatchSnapshots(
  userId: string
): Promise<MatchSnapshotRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_match_snapshots")
      .select("*")
      .eq("user_id", userId)
      .order("snapshot_at", { ascending: true });
    return (data ?? []) as MatchSnapshotRow[];
  } catch {
    return [];
  }
}
