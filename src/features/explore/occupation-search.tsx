"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Loader2, Plus, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { searchOccupationsAction } from "@/lib/esco/actions";
import { majorGroupOf, majorGroupLabel } from "@/lib/esco/isco";
import type { Locale, Occupation } from "@/lib/esco/types";
import { cn } from "@/lib/utils";

/** Debounced occupation search-as-you-type (onboarding step 1 & 3). */
export function OccupationSearch({
  onSelect,
  selectedUris = new Set(),
  placeholder,
}: {
  onSelect: (occ: Occupation) => void;
  selectedUris?: Set<string>;
  placeholder?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("common");
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term, 300);

  const { data, isFetching } = useQuery({
    queryKey: ["occupation-search", debounced, locale],
    queryFn: () => searchOccupationsAction(debounced, locale),
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
          {(data ?? []).map((occ) => {
            const chosen = selectedUris.has(occ.conceptUri);
            const grp = majorGroupOf(occ.iscoGroup);
            return (
              <li key={occ.conceptUri}>
                <button
                  type="button"
                  onClick={() => onSelect(occ)}
                  disabled={chosen}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                    chosen && "opacity-60"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{occ.label}</span>
                    {grp && (
                      <Badge variant="muted" className="mt-1">
                        {majorGroupLabel(grp, locale)}
                      </Badge>
                    )}
                  </span>
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
