"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkillSearch } from "@/features/explore/skill-search";
import { addSkill, removeSkill } from "@/lib/db/mutations";
import type { Skill } from "@/lib/esco/types";
import type { SkillSource } from "@/lib/db/types";

interface ManagedSkill extends Skill {
  source: SkillSource | null;
}

/** Add/remove the user's skills with optimistic-ish UI. */
export function SkillsManager({ initialSkills }: { initialSkills: ManagedSkill[] }) {
  const t = useTranslations("skills");
  const [skills, setSkills] = useState<ManagedSkill[]>(initialSkills);
  const [isPending, startTransition] = useTransition();

  const selectedUris = new Set(skills.map((s) => s.conceptUri));

  function add(skill: Skill) {
    if (selectedUris.has(skill.conceptUri)) return;
    setSkills((prev) => [...prev, { ...skill, source: "search" }]);
    startTransition(() => {
      void addSkill(skill.conceptUri, "search");
    });
  }

  function remove(uri: string) {
    setSkills((prev) => prev.filter((s) => s.conceptUri !== uri));
    startTransition(() => {
      void removeSkill(uri);
    });
  }

  return (
    <div className="space-y-5">
      <div className="max-w-md">
        <p className="mb-2 text-sm font-medium">{t("addSkill")}</p>
        <SkillSearch onSelect={add} selectedUris={selectedUris} placeholder={t("searchSkill")} />
      </div>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          {t("count", { count: skills.length })}
        </p>
        <ul className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <li key={s.conceptUri}>
              <Badge variant="secondary" className="gap-1.5 py-1 pl-3 pr-1.5">
                <span>{s.label}</span>
                {s.source && (
                  <span className="text-[10px] text-muted-foreground">
                    · {t(`source_${s.source}` as "source_search")}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={isPending}
                  aria-label={t("removeConfirm")}
                  onClick={() => remove(s.conceptUri)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
