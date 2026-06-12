import { setRequestLocale, getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { getTransversalSkills } from "@/lib/esco/queries";
import type { Locale } from "@/lib/esco/types";
import { OnboardingWizard } from "@/features/onboarding/wizard";
import { GuestMigrator } from "@/features/auth/guest-migrator";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("onboarding");
  const tApp = await getTranslations("app");
  const transversalSkills = await getTransversalSkills(locale as Locale, 18);

  return (
    <main className="min-h-screen px-4 py-10">
      <GuestMigrator />
      <div className="mx-auto mb-8 flex max-w-2xl items-center gap-2 text-lg font-semibold">
        <Sparkles className="h-6 w-6 text-primary" />
        {tApp("name")}
      </div>
      <h1 className="mx-auto mb-8 max-w-2xl text-2xl font-bold tracking-tight">
        {t("title")}
      </h1>
      <OnboardingWizard transversalSkills={transversalSkills} />
    </main>
  );
}
