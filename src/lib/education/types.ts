/**
 * Finnish vocational qualification types, mirroring the ePerusteet-sourced
 * tables in migration 0009. Resolved into the active locale by queries.ts, the
 * same way the ESCO types are.
 */

/** ePerusteet `koulutustyyppi` codes, narrowed to the three vocational ones. */
export type QualificationType =
  | "koulutustyyppi_1" // perustutkinto
  | "koulutustyyppi_11" // ammattitutkinto
  | "koulutustyyppi_12"; // erikoisammattitutkinto

/** A Finnish vocational qualification resolved into the active locale. */
export interface EducationProgram {
  id: number;
  /** Raw ePerusteet type code; use qualificationLevel() for a display label. */
  koulutustyyppi: string;
  label: string;
  /** Registry number (e.g. "OPH-1234-2022"); null for older entries. */
  diaarinumero: string | null;
}

/** A qualification together with why it surfaced for this user. */
export interface ProgramMatch extends EducationProgram {
  /** Cosine similarity of the strongest link behind this match, 0..1. */
  similarity: number;
  /**
   * How many of the skills asked about this qualification covers. Only set by
   * the skill-driven lookup, where "covers 4 of your 6 gaps" is the point.
   */
  coveredSkills?: number;
}
