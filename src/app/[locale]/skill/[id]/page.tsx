import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getSkillByUri, getOccupationsForSkill } from "@/lib/esco/queries";
import type { Locale, Occupation } from "@/lib/esco/types";
import { majorGroupOf, majorGroupLabel } from "@/lib/esco/isco";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";

export default async function SkillPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("explore");
  const tc = await getTranslations("common");

  const uri = decodeURIComponent(id);
  const skill = await getSkillByUri(uri, locale as Locale);
  if (!skill) notFound();

  const { essential, optional } = await getOccupationsForSkill(
    uri,
    locale as Locale
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <p className="text-sm font-medium text-primary">{t("skillTitle")}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{skill.label}</h1>
        {skill.description && (
          <p className="mt-3 text-muted-foreground">{skill.description}</p>
        )}

        <p className="mb-4 mt-8 font-semibold">{t("requiredIn")}</p>

        {essential.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              {tc("essential")} · {t("asEssential")}
            </h2>
            <OccupationLinks occupations={essential} locale={locale as Locale} />
          </section>
        )}

        {optional.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              {tc("optional")} · {t("asOptional")}
            </h2>
            <OccupationLinks occupations={optional} locale={locale as Locale} />
          </section>
        )}

        {essential.length === 0 && optional.length === 0 && (
          <p className="text-sm text-muted-foreground">{tc("noResults")}</p>
        )}
      </main>
    </div>
  );
}

function OccupationLinks({
  occupations,
  locale,
}: {
  occupations: Occupation[];
  locale: Locale;
}) {
  return (
    <ul className="space-y-1.5">
      {occupations.map((occ) => {
        const grp = majorGroupOf(occ.iscoGroup);
        return (
          <li key={occ.conceptUri}>
            <Link
              href={`/occupation/${occ.code}`}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <span className="truncate">{occ.label}</span>
              <span className="flex shrink-0 items-center gap-2">
                {grp && (
                  <Badge variant="muted" className="hidden sm:inline-flex">
                    {majorGroupLabel(grp, locale)}
                  </Badge>
                )}
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
