"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Permanently delete the current user. Uses the service-role client to remove
 * the auth user; all user-data tables cascade via `on delete cascade` (GDPR
 * right-to-erasure). After this the session is invalid; the client redirects.
 */
export async function deleteAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" as const };

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) return { ok: false, error: error.message };
    await supabase.auth.signOut();
    return { ok: true as const };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "error" };
  }
}
