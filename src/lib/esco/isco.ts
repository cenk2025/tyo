/**
 * ISCO-08 major groups (the first digit of an ISCO code). Used for badges,
 * filters, and grouping the target-occupation radar chart by skill area.
 */
export const ISCO_MAJOR_GROUPS: Record<string, { fi: string; en: string }> = {
  "0": { fi: "Sotilaat", en: "Armed forces" },
  "1": { fi: "Johtajat", en: "Managers" },
  "2": { fi: "Erityisasiantuntijat", en: "Professionals" },
  "3": { fi: "Asiantuntijat", en: "Technicians & associate professionals" },
  "4": { fi: "Toimisto- ja asiakaspalvelutyöntekijät", en: "Clerical support workers" },
  "5": { fi: "Palvelu- ja myyntityöntekijät", en: "Service & sales workers" },
  "6": { fi: "Maa- ja metsätalous", en: "Agricultural & fishery workers" },
  "7": { fi: "Rakennus-, korjaus- ja valmistustyö", en: "Craft & related trades" },
  "8": { fi: "Prosessi- ja kuljetustyö", en: "Plant & machine operators" },
  "9": { fi: "Avustavat työntekijät", en: "Elementary occupations" },
};

/** Extract the ISCO major group (first digit) from an ISCO code or group string. */
export function majorGroupOf(iscoGroup: string | null | undefined): string | null {
  if (!iscoGroup) return null;
  const match = iscoGroup.match(/\d/);
  return match ? match[0] : null;
}

/** Localized label for an ISCO major group digit. */
export function majorGroupLabel(digit: string | null, locale: "fi" | "en"): string {
  if (!digit) return "—";
  return ISCO_MAJOR_GROUPS[digit]?.[locale] ?? digit;
}
