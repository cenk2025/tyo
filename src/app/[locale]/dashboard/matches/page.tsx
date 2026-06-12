import { setRequestLocale, getTranslations } from "next-intl/server";
import { Target } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getUserTargetUris } from "@/lib/db/queries";
import { getOccupationMatches } from "@/features/matching/server";
import type { Locale } from "@/lib/esco/types";
import { MatchesResults } from "@/features/matching/matches-results";
import { EmptyState } from "@/features/dashboard/empty-state";

export default async function MatchesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("matches");
  const te = await getTranslations("widgetEmpty");

  const user = await getCurrentUser();
  const [matches, targets] = await Promise.all([
    user ? getOccupationMatches(user.id, locale as Locale) : [],
    user ? getUserTargetUris(user.id) : [],
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {matches.length > 0 ? (
        <MatchesResults matches={matches} initialTargets={targets} />
      ) : (
        <EmptyState
          icon={Target}
          title={te("matchesTitle")}
          body={te("matchesBody")}
          ctaLabel={te("matchesCta")}
          ctaHref="/dashboard/skills"
        />
      )}
    </div>
  );
}
