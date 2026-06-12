"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Loader2, Plus, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { searchSkillsAction } from "@/lib/esco/actions";
import type { Locale, Skill } from "@/lib/esco/types";
import { cn } from "@/lib/utils";

/**
 * Debounced skill search-as-you-type. Calls a server action (trigram ILIKE) and
 * lists up to 10 results. `selectedUris` shows which results are already chosen.
 */
export function SkillSearch({
  onSelect,
  selectedUris = new Set(),
  placeholder,
}: {
  onSelect: (skill: Skill) => void;
  selectedUris?: Set<string>;
  placeholder?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("common");
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term, 300);

  const { data, isFetching } = useQuery({
    queryKey: ["skill-search", debounced, locale],
    queryFn: () => searchSkillsAction(debounced, locale),
    enabled: debounced.trim().length >= 2,
  });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={placeholder ?? t("searchPlaceholder")}
          className="pl-9"
          aria-label={t("search")}
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {debounced.trim().length >= 2 && (
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-1">
          {(data ?? []).length === 0 && !isFetching && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {t("noResults")}
            </li>
          )}
          {(data ?? []).map((skill) => {
            const chosen = selectedUris.has(skill.conceptUri);
            return (
              <li key={skill.conceptUri}>
                <button
                  type="button"
                  onClick={() => onSelect(skill)}
                  disabled={chosen}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                    chosen && "opacity-60"
                  )}
                >
                  <span className="truncate">{skill.label}</span>
                  {chosen ? (
                    <Check className="h-4 w-4 shrink-0 text-have" />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
