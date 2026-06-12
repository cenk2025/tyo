"use client";

import type { GuestProfile, SkillSource } from "@/lib/db/types";

/**
 * Guest profile persistence (sessionStorage). Unauthenticated users can build a
 * temporary profile; on signup it's migrated into the database. Kept tiny and
 * dependency-free so it can run during SSR hydration safely.
 */
const KEY = "skillpath_guest";

const EMPTY: GuestProfile = {
  currentOccupationUri: null,
  skills: [],
  targets: [],
};

export function getGuestProfile(): GuestProfile {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as GuestProfile) };
  } catch {
    return EMPTY;
  }
}

function save(profile: GuestProfile) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(profile));
    window.dispatchEvent(new Event("skillpath:guest-changed"));
  } catch {
    /* sessionStorage unavailable (private mode) — ignore */
  }
}

export function hasGuestData(): boolean {
  const p = getGuestProfile();
  return p.skills.length > 0 || p.targets.length > 0 || !!p.currentOccupationUri;
}

export function addGuestSkill(skillUri: string, source: SkillSource = "search") {
  const p = getGuestProfile();
  if (!p.skills.some((s) => s.skillUri === skillUri)) {
    p.skills.push({ skillUri, source });
    save(p);
  }
}

export function removeGuestSkill(skillUri: string) {
  const p = getGuestProfile();
  p.skills = p.skills.filter((s) => s.skillUri !== skillUri);
  save(p);
}

export function setGuestOccupation(uri: string | null) {
  const p = getGuestProfile();
  p.currentOccupationUri = uri;
  save(p);
}

export function toggleGuestTarget(uri: string) {
  const p = getGuestProfile();
  p.targets = p.targets.includes(uri)
    ? p.targets.filter((u) => u !== uri)
    : [...p.targets, uri];
  save(p);
}

export function clearGuestProfile() {
  try {
    window.sessionStorage.removeItem(KEY);
    window.dispatchEvent(new Event("skillpath:guest-changed"));
  } catch {
    /* ignore */
  }
}
