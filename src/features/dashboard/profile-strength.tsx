"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProfileDonut, type DonutDatum } from "@/components/charts/profile-donut";
import type { Skill } from "@/lib/esco/types";

/** Profile strength: total skill count + donuts by type and by breadth. */
export function ProfileStrength({ skills }: { skills: Skill[] }) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("charts");

  const byType = countBy(skills, (s) =>
    s.skillType === "knowledge" ? t("skillType_knowledge") : t("skillType_skill")
  );
  const byReuse = countBy(skills, (s) => {
    const key = s.reuseLevel ?? "cross-sector";
    return t(`reuse_${key}` as `reuse_${typeof key}`);
  });

  return (
    <Tabs defaultValue="type">
      <TabsList className="mb-2">
        <TabsTrigger value="type">{t("bySkillType")}</TabsTrigger>
        <TabsTrigger value="reuse">{t("byReuseLevel")}</TabsTrigger>
      </TabsList>
      <TabsContent value="type">
        <ProfileDonut
          data={byType}
          tableCaption={t("bySkillType")}
          categoryLabel={tc("category")}
          valueLabel={tc("value")}
          centerLabel={t("totalSkills")}
        />
      </TabsContent>
      <TabsContent value="reuse">
        <ProfileDonut
          data={byReuse}
          tableCaption={t("byReuseLevel")}
          categoryLabel={tc("category")}
          valueLabel={tc("value")}
          centerLabel={t("totalSkills")}
        />
      </TabsContent>
    </Tabs>
  );
}

function countBy(skills: Skill[], keyFn: (s: Skill) => string): DonutDatum[] {
  const map = new Map<string, number>();
  for (const s of skills) {
    const k = keyFn(s);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
