import { setRequestLocale, getTranslations } from "next-intl/server";
import { ListChecks, Target, GraduationCap, TrendingUp, ArrowRight, Leaf } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserProfile, getLearningList } from "@/lib/db/queries";
import { getDashboardData } from "@/features/dashboard/data";
import type { Locale } from "@/lib/esco/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProfileStrength } from "@/features/dashboard/profile-strength";
import { GreenDigital } from "@/features/dashboard/green-digital";
import { LearningBoard } from "@/features/dashboard/learning-board";
import { EmptyState } from "@/features/dashboard/empty-state";
import { MatchesBar } from "@/components/charts/matches-bar";
import { TargetRadar } from "@/components/charts/target-radar";
import { GapLine } from "@/components/charts/gap-line";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");
  const te = await getTranslations("widgetEmpty");
  const tc = await getTranslations("charts");
  const tm = await getTranslations("matches");

  const user = await getCurrentUser();
  const [profile, data, learning] = await Promise.all([
    user ? getUserProfile(user.id) : null,
    user ? getDashboardData(user.id, locale as Locale) : null,
    user ? getLearningList(user.id, locale as Locale) : [],
  ]);

  const name = profile?.display_name || "";
  const skills = data?.skills ?? [];
  const matches = data?.matches ?? [];
  const targets = data?.targets ?? [];

  const barData = matches.slice(0, 10).map((m) => ({
    code: m.code,
    label: m.label,
    essentialPct: Math.round(0.7 * m.essentialCoverage * 100),
    optionalPct: Math.round(0.3 * m.optionalCoverage * 100),
    score: m.score,
  }));

  const radarRows = (data?.radar.rows ?? []).map((r) => ({
    ...r,
    group: t(`reuse_${r.group as string}` as "reuse_transversal"),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {name ? t("welcome", { name }) : t("welcomeAnon")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile strength */}
        <Card>
          <CardHeader>
            <CardTitle>{t("profileStrength")}</CardTitle>
            <CardDescription>{t("profileStrengthDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {skills.length > 0 ? (
              <ProfileStrength skills={skills} />
            ) : (
              <EmptyState
                icon={ListChecks}
                title={te("skillsTitle")}
                body={te("skillsBody")}
                ctaLabel={te("skillsCta")}
                ctaHref="/dashboard/skills"
              />
            )}
          </CardContent>
        </Card>

        {/* Top matches */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{t("topMatches")}</CardTitle>
              <CardDescription>{t("topMatchesDesc")}</CardDescription>
            </div>
            {matches.length > 0 && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/matches">
                  {t("viewAllMatches")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <MatchesBar
                data={barData}
                locale={locale}
                essentialLabel={tm("essentialCoverage")}
                optionalLabel={tm("optionalCoverage")}
              />
            ) : (
              <EmptyState
                icon={Target}
                title={te("matchesTitle")}
                body={te("matchesBody")}
                ctaLabel={te("matchesCta")}
                ctaHref="/dashboard/skills"
              />
            )}
          </CardContent>
        </Card>

        {/* Target radar */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("targetRadar")}</CardTitle>
            <CardDescription>{t("targetRadarDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {targets.length > 0 ? (
              <TargetRadar
                data={radarRows}
                targets={data?.radar.targetLabels ?? []}
                caption={t("targetRadar")}
                groupLabel={tc("skillGroup")}
              />
            ) : (
              <EmptyState
                icon={Target}
                title={te("targetsTitle")}
                body={te("targetsBody")}
                ctaLabel={te("targetsCta")}
                ctaHref="/dashboard/matches"
              />
            )}
          </CardContent>
        </Card>

        {/* Gap over time */}
        <Card>
          <CardHeader>
            <CardTitle>{t("gapOverTime")}</CardTitle>
            <CardDescription>{t("gapOverTimeDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.gap.rows.length ?? 0) > 1 ? (
              <GapLine
                data={data!.gap.rows}
                series={data!.gap.series}
                caption={t("gapOverTime")}
                dateLabel={tc("date")}
              />
            ) : (
              <EmptyState
                icon={TrendingUp}
                title={te("snapshotsTitle")}
                body={te("snapshotsBody")}
              />
            )}
          </CardContent>
        </Card>

        {/* Green & digital readiness */}
        <Card>
          <CardHeader>
            <CardTitle>{t("greenDigital")}</CardTitle>
            <CardDescription>{t("greenDigitalDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {skills.length > 0 ? (
              <GreenDigital skills={skills} />
            ) : (
              <EmptyState
                icon={Leaf}
                title={te("skillsTitle")}
                body={te("skillsBody")}
                ctaLabel={te("skillsCta")}
                ctaHref="/dashboard/skills"
              />
            )}
          </CardContent>
        </Card>

        {/* Learning board */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("learningBoard")}</CardTitle>
            <CardDescription>{t("learningBoardDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {learning.length > 0 ? (
              <LearningBoard items={learning} />
            ) : (
              <EmptyState
                icon={GraduationCap}
                title={te("learningTitle")}
                body={te("learningBody")}
                ctaLabel={te("learningCta")}
                ctaHref="/occupations"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
