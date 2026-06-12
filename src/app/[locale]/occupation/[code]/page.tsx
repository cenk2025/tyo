import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { CheckCircle2, Target as TargetIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getOccupationByCode, getOccupationSkills } from "@/lib/esco/queries";
import { getCurrentUser } from "@/lib/auth";
import {
  getUserSkillUris,
  getUserTargetUris,
} from "@/lib/db/queries";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/flags";
import type { Locale, OccupationSkill } from "@/lib/esco/types";
import { majorGroupOf, majorGroupLabel } from "@/lib/esco/isco";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CircularProgress } from "@/components/charts/circular-progress";
import { AddLearningButton } from "@/features/profile/add-learning-button";
import { SetTargetButton } from "@/features/matching/set-target-button";
import { formatPercent } from "@/lib/utils";

async function getLearningUris(userId: string): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_learning_list")
      .select("skill_uri")
      .eq("user_id", userId);
    return new Set((data ?? []).map((r) => r.skill_uri as string));
  } catch {
    return new Set();
  }
}

export default async function OccupationPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("occupation");

  const occupation = await getOccupationByCode(code, locale as Locale);
  if (!occupation) notFound();

  const [skills, user] = await Promise.all([
    getOccupationSkills(occupation.conceptUri, locale as Locale),
    getCurrentUser(),
  ]);

  const [userSkills, targets, learning] = user
    ? await Promise.all([
        getUserSkillUris(user.id),
        getUserTargetUris(user.id),
        getLearningUris(user.id),
      ])
    : [[] as string[], [] as string[], new Set<string>()];

  const userSet = new Set(userSkills);
  const essential = skills.filter((s) => s.relationType === "essential");
  const optional = skills.filter((s) => s.relationType === "optional");
  const haveEssential = essential.filter((s) => userSet.has(s.conceptUri));
  const missingEssential = essential.filter((s) => !userSet.has(s.conceptUri));
  const coverage = essential.length ? haveEssential.length / essential.length : 0;
  const grp = majorGroupOf(occupation.iscoGroup);
  const isTarget = targets.includes(occupation.conceptUri);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          {grp && (
            <Badge variant="muted" className="mb-2">
              {majorGroupLabel(grp, locale as Locale)}
            </Badge>
          )}
          <h1 className="text-3xl font-bold tracking-tight">{occupation.label}</h1>
          {occupation.description && (
            <p className="mt-3 max-w-2xl text-muted-foreground">
              {occupation.description}
            </p>
          )}
        </div>

        {/* Coverage summary / login prompt */}
        {user ? (
          <Card className="mb-8">
            <CardContent className="flex flex-col items-center gap-6 p-6 sm:flex-row">
              <CircularProgress value={coverage} label={t("essentialSkills")} />
              <div className="flex-1 text-center sm:text-left">
                <p className="text-lg font-medium">
                  {t("coverageSummary", {
                    matched: haveEssential.length,
                    total: essential.length,
                    percent: formatPercent(coverage, locale),
                  })}
                </p>
                <div className="mt-4">
                  <SetTargetButton
                    occupationUri={occupation.conceptUri}
                    isTarget={isTarget}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-8 border-primary/20 bg-primary/5">
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <p className="text-sm">{t("loginToSee")}</p>
              <Link
                href="/signup"
                className="shrink-0 text-sm font-medium text-primary hover:underline"
              >
                {t("setTarget")}
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Essential skills: have / missing */}
        {user && (
          <div className="mb-8 grid gap-6 md:grid-cols-2">
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4 text-have" />
                {t("skillsYouHave")} ({haveEssential.length})
              </h2>
              <SkillList skills={haveEssential} locale={locale as Locale} tone="have" />
            </section>
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                <TargetIcon className="h-4 w-4 text-gap" />
                {t("skillsYouMiss")} ({missingEssential.length})
              </h2>
              <SkillList
                skills={missingEssential}
                locale={locale as Locale}
                tone="gap"
                learning={learning}
                showAddLearning
              />
            </section>
          </div>
        )}

        {/* Guest: plain essential list */}
        {!user && (
          <section className="mb-8">
            <h2 className="mb-3 font-semibold">
              {t("essentialSkills")} ({essential.length})
            </h2>
            <SkillList skills={essential} locale={locale as Locale} />
          </section>
        )}

        {/* Optional skills */}
        {optional.length > 0 && (
          <section>
            <h2 className="mb-3 font-semibold">
              {t("optionalSkills")} ({optional.length})
            </h2>
            <SkillList skills={optional} locale={locale as Locale} />
          </section>
        )}
      </main>
    </div>
  );
}

function SkillList({
  skills,
  tone,
  learning,
  showAddLearning,
}: {
  skills: OccupationSkill[];
  locale?: Locale;
  tone?: "have" | "gap";
  learning?: Set<string>;
  showAddLearning?: boolean;
}) {
  if (skills.length === 0) {
    return <p className="text-sm text-muted-foreground">—</p>;
  }
  return (
    <ul className="space-y-2">
      {skills.map((s) => (
        <li
          key={s.conceptUri}
          className={
            "rounded-lg border p-3 " +
            (tone === "have"
              ? "border-have/30 bg-have/5"
              : tone === "gap"
                ? "border-gap/30 bg-gap/5"
                : "")
          }
        >
          <details>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <Link
                href={`/skill/${encodeURIComponent(s.conceptUri)}`}
                className="font-medium hover:underline"
              >
                {s.label}
              </Link>
              {showAddLearning && (
                <span className="shrink-0">
                  <AddLearningButton
                    skillUri={s.conceptUri}
                    inList={learning?.has(s.conceptUri) ?? false}
                  />
                </span>
              )}
            </summary>
            {s.description && (
              <p className="mt-2 text-sm text-muted-foreground">{s.description}</p>
            )}
          </details>
        </li>
      ))}
    </ul>
  );
}
