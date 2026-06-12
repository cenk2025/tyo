"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeMatchSnapshots } from "./snapshots";
import type { SkillSource, LearningStatus } from "./types";

/**
 * Server Actions for user-data mutations. Every action that changes the user's
 * skill set calls `writeMatchSnapshots` afterwards so progress charts stay
 * accurate. All writes are RLS-scoped to the authenticated user.
 */

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function addSkill(skillUri: string, source: SkillSource = "search") {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthenticated" as const };
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_skills")
    .upsert({ user_id: userId, skill_uri: skillUri, source }, { onConflict: "user_id,skill_uri" });
  if (error) return { ok: false, error: error.message };
  await writeMatchSnapshots(userId);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function addSkills(
  skills: { skillUri: string; source: SkillSource }[]
) {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthenticated" as const };
  if (skills.length === 0) return { ok: true as const };
  const supabase = await createClient();
  const rows = skills.map((s) => ({
    user_id: userId,
    skill_uri: s.skillUri,
    source: s.source,
  }));
  const { error } = await supabase
    .from("user_skills")
    .upsert(rows, { onConflict: "user_id,skill_uri" });
  if (error) return { ok: false, error: error.message };
  await writeMatchSnapshots(userId);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function removeSkill(skillUri: string) {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthenticated" as const };
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_skills")
    .delete()
    .eq("user_id", userId)
    .eq("skill_uri", skillUri);
  if (error) return { ok: false, error: error.message };
  await writeMatchSnapshots(userId);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function addTarget(occupationUri: string) {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthenticated" as const };
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_target_occupations")
    .upsert(
      { user_id: userId, occupation_uri: occupationUri },
      { onConflict: "user_id,occupation_uri" }
    );
  if (error) return { ok: false, error: error.message };
  // A new target needs an initial snapshot so the progress chart has a baseline.
  await writeMatchSnapshots(userId);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function removeTarget(occupationUri: string) {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthenticated" as const };
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_target_occupations")
    .delete()
    .eq("user_id", userId)
    .eq("occupation_uri", occupationUri);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function addToLearningList(skillUri: string) {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthenticated" as const };
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_learning_list")
    .upsert(
      { user_id: userId, skill_uri: skillUri, status: "planned" },
      { onConflict: "user_id,skill_uri" }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function setLearningStatus(
  skillUri: string,
  status: LearningStatus
) {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthenticated" as const };
  const supabase = await createClient();

  const { error } = await supabase
    .from("user_learning_list")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("user_id", userId)
    .eq("skill_uri", skillUri);
  if (error) return { ok: false, error: error.message };

  // Completing a learning item adds the skill to the profile + new snapshot.
  if (status === "done") {
    await supabase
      .from("user_skills")
      .upsert(
        { user_id: userId, skill_uri: skillUri, source: "search" },
        { onConflict: "user_id,skill_uri" }
      );
    await writeMatchSnapshots(userId);
  }
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function removeFromLearningList(skillUri: string) {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthenticated" as const };
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_learning_list")
    .delete()
    .eq("user_id", userId)
    .eq("skill_uri", skillUri);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function updateProfile(input: {
  displayName?: string;
  locale?: string;
}) {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthenticated" as const };
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.locale !== undefined) patch.locale = input.locale;
  const { error } = await supabase
    .from("user_profiles")
    .update(patch)
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function markOnboarded() {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthenticated" as const };
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ onboarded: true })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true as const };
}
