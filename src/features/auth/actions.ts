"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeMatchSnapshots } from "@/lib/db/snapshots";
import type { GuestProfile } from "@/lib/db/types";

/**
 * Migrate a guest profile (built in sessionStorage before signup) into the
 * database for the now-authenticated user. Idempotent via upserts.
 */
export async function migrateGuestProfile(profile: GuestProfile) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" as const };

  const userId = user.id;

  if (profile.skills.length > 0) {
    await supabase.from("user_skills").upsert(
      profile.skills.map((s) => ({
        user_id: userId,
        skill_uri: s.skillUri,
        source: s.source,
      })),
      { onConflict: "user_id,skill_uri" }
    );
  }

  if (profile.targets.length > 0) {
    await supabase.from("user_target_occupations").upsert(
      profile.targets.map((occupation_uri) => ({
        user_id: userId,
        occupation_uri,
      })),
      { onConflict: "user_id,occupation_uri" }
    );
  }

  if (profile.currentOccupationUri) {
    await supabase
      .from("user_profiles")
      .update({ current_occupation_uri: profile.currentOccupationUri })
      .eq("id", userId);
  }

  await writeMatchSnapshots(userId);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/** Sign the current user out (server action). */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
}
