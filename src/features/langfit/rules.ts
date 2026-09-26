import type { LangTask, RegulatedKey } from "./types";
import { emptyLevels, levelRank } from "./types";

/**
 * The rule layer. For regulated professions the language requirement comes
 * from law, not from the employer's (or the model's) judgement, so it is
 * inserted as a locked row that neither the AI suggestion nor the editor can
 * relax: English can't be marked sufficient and it applies from day one.
 *
 * DEMO DATA: a hand-kept two-entry excerpt, modelled on Kielibuusti's list of
 * regulated professions and their language requirements. The laws below
 * require "sufficient"/position-specific language skills rather than a fixed
 * CEFR level, so the lock deliberately fixes the qualitative part only and
 * leaves the levels for the employer to set. Verify against Kielibuusti and
 * the statute before relying on it.
 */
export interface RegulatedRule {
  key: RegulatedKey;
  label: { fi: string; en: string };
  statute: { fi: string; en: string };
  /** The locked row's task text. */
  task: { fi: string; en: string };
  rationale: { fi: string; en: string };
  /** Lowercase substrings that suggest (never force) this rule for an ad. */
  keywords: string[];
}

export const REGULATED_RULES: RegulatedRule[] = [
  {
    key: "health_professional",
    label: {
      fi: "Terveydenhuollon ammattihenkilö (esim. sairaanhoitaja, lähihoitaja)",
      en: "Healthcare professional (e.g. nurse, practical nurse)",
    },
    statute: {
      fi: "Laki terveydenhuollon ammattihenkilöistä (559/1994)",
      en: "Act on Health Care Professionals (559/1994)",
    },
    task: {
      fi: "Potilastyö ja potilasturvallisuuteen liittyvä viestintä",
      en: "Patient work and patient-safety communication",
    },
    rationale: {
      fi: "Laki edellyttää, että terveydenhuollon ammattihenkilöllä on tehtävän hoitamiseen riittävä kielitaito; työnantaja vastaa sen varmistamisesta. Laki ei määrää CEFR-tasoa, joten tasot arvioidaan tehtävän mukaan.",
      en: "The law requires a healthcare professional to have language skills sufficient for the work, and the employer is responsible for ensuring it. The law sets no CEFR level, so the levels are assessed per task.",
    },
    keywords: ["sairaanhoitaja", "lähihoitaja", "terveydenhoitaja", "lääkäri", "kätilö", "nurse", "physician", "doctor", "midwife"],
  },
  {
    key: "public_authority",
    label: {
      fi: "Julkisyhteisön virka tai tehtävä, johon liittyy julkista valtaa",
      en: "Public-sector post involving the exercise of public authority",
    },
    statute: {
      fi: "Laki julkisyhteisöjen henkilöstöltä vaadittavasta kielitaidosta (424/2003) ja kielilaki (423/2003)",
      en: "Act on the Knowledge of Languages Required of Personnel in Public Bodies (424/2003) and the Language Act (423/2003)",
    },
    task: {
      fi: "Viranomaisasiointi ja päätösten tiedoksianto kansalliskielellä",
      en: "Official dealings and communicating decisions in a national language",
    },
    rationale: {
      fi: "Viranomaisen on palveltava asiakkaita suomeksi (ja kaksikielisissä yksiköissä ruotsiksi); kielitaitovaatimus määräytyy viran mukaan.",
      en: "Authorities must serve people in Finnish (and in bilingual units in Swedish); the requirement is set per post.",
    },
    keywords: ["virka", "viranhaltija", "kunta", "kaupunki", "hyvinvointialue", "viranomainen", "municipality", "public authority"],
  },
];

export function getRule(key: RegulatedKey | null): RegulatedRule | null {
  return REGULATED_RULES.find((r) => r.key === key) ?? null;
}

/** A regulated-profession suggestion for an ad, from keywords. The employer decides. */
export function detectRegulated(adText: string): RegulatedKey | null {
  const text = adText.toLowerCase();
  for (const r of REGULATED_RULES) {
    if (r.keywords.some((k) => text.includes(k))) return r.key;
  }
  return null;
}

/**
 * Re-impose the rule on a task list: exactly one locked row for the selected
 * profession, with its fixed fields restored whatever was sent. Run in the
 * client after every change AND on the server before saving.
 */
export function applyRules(
  tasks: LangTask[],
  regulated: RegulatedKey | null,
  locale: "fi" | "en"
): LangTask[] {
  const rule = getRule(regulated);
  const unlocked = tasks.filter((t) => !t.locked);
  if (!rule) return unlocked;

  const existing = tasks.find((t) => t.locked && t.origin === "rule");
  const locked: LangTask = {
    id: existing?.id ?? `rule-${rule.key}`,
    description: rule.task[locale],
    language: existing?.language === "sv" ? "sv" : "fi",
    levels: existing?.levels ?? { ...emptyLevels(), listening: "B1", reading: "B1", speaking: "B1", writing: "B1" },
    requiredBy: "day1",
    rationaleType: "legislation",
    rationale: rule.rationale[locale],
    englishSufficient: false,
    origin: "rule",
    validated: existing?.validated ?? false,
    locked: true,
  };
  // A legal requirement can't drop a skill entirely; floor every level at A1.
  for (const k of Object.keys(locked.levels) as (keyof LangTask["levels"])[]) {
    if (!locked.levels[k]) locked.levels[k] = "A1";
  }
  return [locked, ...unlocked];
}

export type TaskWarning =
  | "unvalidated"
  | "noRationale"
  | "highWithoutRationale"
  | "rationaleTextMissing"
  | "noLevels";

/** Checks that nudge the employer toward requirements that are genuinely job-based. */
export function taskWarnings(t: LangTask): TaskWarning[] {
  const out: TaskWarning[] = [];
  if (!t.validated) out.push("unvalidated");
  const needsNational = t.language !== "en" && !t.englishSufficient;
  const top = Math.max(...Object.values(t.levels).map(levelRank));
  if (top === 0) out.push("noLevels");
  if (needsNational && t.rationaleType === "none") out.push("noRationale");
  if (top >= levelRank("C1") && t.rationaleType === "none") out.push("highWithoutRationale");
  if (t.rationaleType !== "none" && t.rationale.trim().length < 10) out.push("rationaleTextMissing");
  return out;
}
