import { setRequestLocale, getTranslations } from "next-intl/server";
import { GraduationCap } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getLearningList } from "@/lib/db/queries";
import type { Locale } from "@/lib/esco/types";
import { LearningBoard } from "@/features/dashboard/learning-board";
import { EmptyState } from "@/features/dashboard/empty-state";

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
    </div>
  );
}
