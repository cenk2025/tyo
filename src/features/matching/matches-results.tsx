"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Target, ArrowRight, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { addTarget, removeTarget } from "@/lib/db/mutations";
import { majorGroupOf, majorGroupLabel, ISCO_MAJOR_GROUPS } from "@/lib/esco/isco";
import { formatPercent } from "@/lib/utils";
import type { Locale, OccupationMatch } from "@/lib/esco/types";

const MIN_OPTIONS = [0, 0.25, 0.5, 0.75];

export function MatchesResults({
  matches,
  initialTargets,
}: {
  matches: OccupationMatch[];
  initialTargets: string[];
}) {
  const t = useTranslations("matches");
  const locale = useLocale() as Locale;
  const [group, setGroup] = useState<string>("all");
  const [minMatch, setMinMatch] = useState(0);
  const [targets, setTargets] = useState<Set<string>>(new Set(initialTargets));
  const [isPending, startTransition] = useTransition();

  const groupsPresent = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) {
      const g = majorGroupOf(m.iscoGroup);
      if (g) set.add(g);
    }
    return [...set].sort();
  }, [matches]);

  const filtered = matches.filter((m) => {
    if (m.score < minMatch) return false;
    if (group !== "all" && majorGroupOf(m.iscoGroup) !== group) return false;
    return true;
  });

  function toggleTarget(uri: string) {
    const isTarget = targets.has(uri);
    setTargets((prev) => {
      const next = new Set(prev);
      if (isTarget) next.delete(uri);
      else next.add(uri);
      return next;
    });
    startTransition(() => {
      void (isTarget ? removeTarget(uri) : addTarget(uri));
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">{t("filterGroup")}</span>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">{t("filterAllGroups")}</option>
            {groupsPresent.map((g) => (
              <option key={g} value={g}>
                {majorGroupLabel(g, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">{t("filterMinMatch")}</span>
          <select
            value={minMatch}
            onChange={(e) => setMinMatch(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {MIN_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {formatPercent(v, locale)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((m) => {
            const grp = majorGroupOf(m.iscoGroup);
            const isTarget = targets.has(m.occupationUri);
            const essW = 0.7 * m.essentialCoverage * 100;
            const optW = 0.3 * m.optionalCoverage * 100;
            return (
              <li key={m.occupationUri}>
                <Card>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold">{m.label}</h3>
                        {grp && grp in ISCO_MAJOR_GROUPS && (
                          <Badge variant="muted" className="shrink-0">
                            {majorGroupLabel(grp, locale)}
                          </Badge>
                        )}
                      </div>
                      <div
                        className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-secondary"
                        role="img"
                        aria-label={`${t("matchPercent")} ${formatPercent(m.score, locale)}`}
                      >
                        <span style={{ width: `${essW}%`, background: "var(--chart-1)" }} />
                        <span style={{ width: `${optW}%`, background: "var(--chart-3)" }} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {t("essentialCoverage")}:{" "}
                          {t("matchedOf", {
                            matched: m.matchedEssential,
                            total: m.totalEssential,
                          })}
                        </span>
                        <span>
                          {t("optionalCoverage")}:{" "}
                          {t("matchedOf", {
                            matched: m.matchedOptional,
                            total: m.totalOptional,
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <div className="text-xl font-bold tabular-nums">
                          {formatPercent(m.score, locale)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("matchPercent")}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant={isTarget ? "secondary" : "outline"}
                          size="sm"
                          disabled={isPending}
                          onClick={() => toggleTarget(m.occupationUri)}
                        >
                          {isTarget ? (
                            <>
                              <Check className="h-4 w-4" /> {t("targetSet")}
                            </>
                          ) : (
                            <>
                              <Target className="h-4 w-4" /> {t("setTarget")}
                            </>
                          )}
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/occupation/${m.code}`}>
                            {t("viewOccupation")} <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
