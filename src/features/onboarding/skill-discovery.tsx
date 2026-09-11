"use client";

import { useTranslations } from "next-intl";
import { Check, Plus } from "lucide-react";
import { SkillSearch } from "@/features/explore/skill-search";
import type { Skill } from "@/lib/esco/types";
import type { DiscoveryCategoryKey } from "@/lib/esco/discovery-categories";
import { cn } from "@/lib/utils";

const CATEGORY_ORDER: DiscoveryCategoryKey[] = [
  "people",
  "thinking",
  "organizing",
  "digital",
  "handsOn",
  "caring",
  "personal",
];

/**
 * Skill-first browsing for onboarding's occupation-less branch. Two ways in,
 * on purpose: a language search (ESCO's ~370 language-skill entries are too
 * many to chip-render, and are exactly the skills a new arrival is most
 * likely to actually have) and categorized chips for everything else — so
 * someone can recognise a skill they wouldn't have thought to search for.
 */
export function SkillDiscovery({
  categories,
  selectedUris,
  onToggle,
  onSearchSelect,
}: {
  categories: { category: string; skills: Skill[] }[];
  selectedUris: Set<string>;
  onToggle: (skill: Skill) => void;
  onSearchSelect: (skill: Skill) => void;
}) {
  const t = useTranslations("onboarding.discovery");
  const byKey = new Map(categories.map((c) => [c.category, c.skills]));

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1 text-sm font-medium">{t("languagesTitle")}</p>
        <p className="mb-2 text-sm text-muted-foreground">
          {t("languagesSubtitle")}
        </p>
        <SkillSearch
          onSelect={onSearchSelect}
          selectedUris={selectedUris}
          placeholder={t("languagesPlaceholder")}
        />
      </div>

      {CATEGORY_ORDER.map((key) => {
        const skills = byKey.get(key);
        if (!skills || skills.length === 0) return null;
        return (
          <div key={key}>
            <p className="mb-2 text-sm font-medium">{t(`category.${key}`)}</p>
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => {
                const checked = selectedUris.has(s.conceptUri);
                return (
                  <button
                    key={s.conceptUri}
                    type="button"
                    onClick={() => onToggle(s)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      checked
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:bg-accent"
                    )}
                  >
                    {checked ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
