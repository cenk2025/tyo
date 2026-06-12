import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserSkills } from "@/lib/db/queries";
import { flags } from "@/lib/flags";
import type { Locale } from "@/lib/esco/types";
import { SkillsManager } from "@/features/profile/skills-manager";
import { AiAssist } from "@/features/profile/ai-assist";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default async function SkillsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("skills");

  const user = await getCurrentUser();
  const skills = user ? await getUserSkills(user.id, locale as Locale) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SkillsManager initialSkills={skills} />
        </CardContent>
      </Card>

      {flags.aiAssist && <AiAssist />}
    </div>
  );
}
