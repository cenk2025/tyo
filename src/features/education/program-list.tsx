import { getTranslations } from "next-intl/server";
import { GraduationCap, ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import type { ProgramMatch } from "@/lib/education/types";

/**
 * Renders qualification matches. Shared by the occupation page ("what leads
 * here") and the learning list ("what closes these gaps"), which differ only in
 * whether a coverage count is present.
 */

/**
 * ePerusteet type code to a translated level label. The three vocational codes
 * are the only ones the import keeps (see migration 0009); anything else has no
 * label rather than a guessed one.
 */
function levelKey(koulutustyyppi: string): string | null {
  switch (koulutustyyppi) {
    case "koulutustyyppi_1":
      return "perustutkinto";
    case "koulutustyyppi_11":
      return "ammattitutkinto";
    case "koulutustyyppi_12":
      return "erikoisammattitutkinto";
    default:
      return null;
  }
}

/**
 * Opintopolku is where a qualification is actually applied for, and ePerusteet
 * carries no link to it, so the name is handed to its search instead. A search
 * URL degrades gracefully: if the wording drifts the user still lands on a
 * usable search page rather than a 404.
 */
function opintopolkuUrl(label: string, locale: string): string {
  const base =
    locale === "fi"
      ? "https://opintopolku.fi/konfo/fi/haku/"
      : "https://opintopolku.fi/konfo/en/haku/";
  return base + encodeURIComponent(label);
}

export async function ProgramList({
  programs,
  locale,
  coverageKey = "coversSkills",
}: {
  programs: ProgramMatch[];
  locale: string;
  /**
   * Which sentence explains the coverage count. The skills being counted differ
   * by caller — the user's own learning list in one place, an occupation's
   * essential skills in another — and saying "from your list" about skills the
   * user never picked would be wrong.
   */
  coverageKey?: "coversSkills" | "coversOccupationSkills";
}) {
  const t = await getTranslations("education");

  return (
    <ul className="space-y-2">
      {programs.map((p) => {
        const level = levelKey(p.koulutustyyppi);
        return (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Link
                  href={`/education/${p.id}`}
                  className="font-medium hover:underline"
                >
                  {p.label}
                </Link>
                {level && <Badge variant="muted">{t(level)}</Badge>}
              </div>
              {p.coveredSkills != null && p.coveredSkills > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(coverageKey, { count: p.coveredSkills })}
                </p>
              )}
            </div>
            <a
              href={opintopolkuUrl(p.label, locale)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {t("searchOpintopolku")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
