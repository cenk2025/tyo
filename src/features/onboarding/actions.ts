"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOccupationSkills } from "@/lib/esco/queries";
import { writeMatchSnapshots } from "@/lib/db/snapshots";
import type { Locale, OccupationSkill } from "@/lib/esco/types";
import type { SkillSource } from "@/lib/db/types";

/** Fetch an occupation's skills to pre-fill step 1 ("which do you have?"). */
export async function getOccupationSkillsAction(
  occupationUri: string,
  locale: Locale
): Promise<OccupationSkill[]> {
  return getOccupationSkills(occupationUri, locale);
}

/**
 * Persist the whole onboarding result in one round-trip and mark the profile
 * onboarded, then write an initial snapshot baseline.
 */
export async function completeOnboarding(input: {
  currentOccupationUri: string | null;
  skills: { skillUri: string; source: SkillSource }[];
  targets: string[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" as const };
  const userId = user.id;

  if (input.skills.length > 0) {
    await supabase.from("user_skills").upsert(
      input.skills.map((s) => ({
        user_id: userId,
        skill_uri: s.skillUri,
        source: s.source,
      })),
      { onConflict: "user_id,skill_uri" }
    );
  }

  if (input.targets.length > 0) {
    await supabase.from("user_target_occupations").upsert(
      input.targets.map((occupation_uri) => ({ user_id: userId, occupation_uri })),
      { onConflict: "user_id,occupation_uri" }
    );
  }

  await supabase
    .from("user_profiles")
    .update({
      current_occupation_uri: input.currentOccupationUri,
      onboarded: true,
    })
    .eq("id", userId);

  await writeMatchSnapshots(userId);
  revalidatePath("/", "layout");
  return { ok: true as const };
}
