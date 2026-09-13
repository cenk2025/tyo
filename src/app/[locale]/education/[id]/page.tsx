import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { GraduationCap, CheckCircle2, ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  getProgramById,
  getProgramSkills,
  getProgramOccupations,
} from "@/lib/education/queries";
import { getCurrentUser } from "@/lib/auth";
import { getUserSkillUris } from "@/lib/db/queries";
import type { Locale } from "@/lib/esco/types";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";

const LEVEL_KEY: Record<string, string> = {
  koulutustyyppi_1: "perustutkinto",
  koulutustyyppi_11: "ammattitutkinto",
  koulutustyyppi_12: "erikoisammattitutkinto",
};

export default async function EducationProgramPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("education");

  const programId = Number(id);
  const program = await getProgramById(programId, locale as Locale);
  if (!program) notFound();

  const [skills, occupations, user] = await Promise.all([
    getProgramSkills(programId, locale as Locale),
    getProgramOccupations(programId, locale as Locale),
    getCurrentUser(),
  ]);
  const userSkills = user ? new Set(await getUserSkillUris(user.id)) : new Set<string>();

  const level = LEVEL_KEY[program.koulutustyyppi];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="mb-8">
          {level && (
            <Badge variant="muted" className="mb-2">
              {t(level)}
            </Badge>
          )}
          <h1 className="flex items-start gap-3 text-3xl font-bold tracking-tight">
            <GraduationCap className="mt-1 h-7 w-7 shrink-0 text-muted-foreground" />
            {program.label}
          </h1>
          <p className="mt-3 text-muted-foreground">{t("pageSubtitle")}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
            <a
              href={`https://opintopolku.fi/konfo/${locale === "fi" ? "fi" : "en"}/haku/${encodeURIComponent(program.label)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              {t("searchOpintopolku")}
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={`https://eperusteet.opintopolku.fi/#/fi/ammatillinen/${program.id}/tiedot`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-muted-foreground hover:underline"
            >
              {t("officialSource")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Occupations first: "what job does this lead to" is the question a
            jobseeker brings to a qualification page, and it rests on the
            official degree titles rather than on our own matching. */}
        <section className="mb-8">
          <h2 className="mb-1 font-semibold">{t("occupationsTitle")}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t("occupationsNote")}</p>
          {occupations.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {occupations.map((o) => (
                <li key={o.conceptUri}>
                  <Link
                    href={`/occupation/${o.code}`}
                    className="inline-flex rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
                  >
                    {o.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t("occupationsEmpty")}
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-1 font-semibold">{t("skillsTitle")}</h2>
          <p className="mb-3 max-w-2xl text-sm text-muted-foreground">
            {t("skillsNote")}
          </p>
          {skills.length > 0 ? (
            <ul className="space-y-2">
              {skills.map((s) => {
                const owned = userSkills.has(s.conceptUri);
                return (
                  <li
                    key={s.conceptUri}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                      owned ? "border-have/40 bg-have/5" : "bg-card"
                    }`}
                  >
                    <span className="min-w-0">{s.label}</span>
                    {owned && (
                      <span className="flex shrink-0 items-center gap-1 text-sm text-have">
                        <CheckCircle2 className="h-4 w-4" />
                        {t("youHaveIt")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t("skillsEmpty")}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
