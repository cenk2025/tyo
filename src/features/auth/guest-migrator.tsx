"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { getGuestProfile, hasGuestData, clearGuestProfile } from "./guest";
import { migrateGuestProfile } from "./actions";

/**
 * Mounted inside authenticated layouts. If a guest profile exists in
 * sessionStorage (built before signup in this tab), migrate it into the DB once
 * and clear it. Silent and idempotent.
 */
export function GuestMigrator() {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !hasGuestData()) return;
    done.current = true;
    const profile = getGuestProfile();
    migrateGuestProfile(profile).then((res) => {
      clearGuestProfile();
      if (res?.ok) router.refresh();
    });
  }, [router]);

  return null;
}
