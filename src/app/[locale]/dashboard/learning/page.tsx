import { setRequestLocale, getTranslations } from "next-intl/server";
import { GraduationCap } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getLearningList } from "@/lib/db/queries";
import { getProgramsForSkills } from "@/lib/education/queries";
import type { Locale } from "@/lib/esco/types";
import { LearningBoard } from "@/features/dashboard/learning-board";
import { EmptyState } from "@/features/dashboard/empty-state";
import { ProgramList } from "@/features/education/program-list";

export default async function LearningPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("learning");
  const te = await getTranslations("widgetEmpty");

  const user = await getCurrentUser();
  const items = user ? await getLearningList(user.id, locale as Locale) : [];

  /**
   * Only skills still being learned drive the suggestion. A completed item has
   * already moved into the user's profile, so a qualification that "covers" it
   * is teaching them something they can already do.
   */
  const openSkillUris = items
    .filter((i) => i.status !== "done")
    .map((i) => i.conceptUri);
  const programs =
    openSkillUris.length > 0
      ? await getProgramsForSkills(openSkillUris, locale as Locale)
      : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t("completedAddsSkill")}</p>
      </header>

      {items.length > 0 ? (
        <LearningBoard items={items} />
      ) : (
        <EmptyState
          icon={GraduationCap}
          title={te("learningTitle")}
          body={te("learningBody")}
          ctaLabel={te("learningCta")}
          ctaHref="/occupations"
        />
      )}

      {/* The point of the whole list: what to actually enrol in. Shown only once
          something is on the board, so an empty list stays a single clear call
          to action rather than two stacked empty states. */}
      {openSkillUris.length > 0 && (
        <section>
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
            {t("educationTitle")}
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {t("educationSubtitle")}
          </p>
          {programs.length > 0 ? (
            <ProgramList programs={programs} locale={locale} />
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t("educationEmpty")}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
