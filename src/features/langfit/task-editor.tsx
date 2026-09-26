"use client";

import { useLocale, useTranslations } from "next-intl";
import { Check, Lock, Pencil, Trash2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RegulatedRule } from "./rules";
import { taskWarnings } from "./rules";
import type { Lang, LangSkill, LangTask, Level, RationaleType, RequiredBy } from "./types";
import { CEFR_LEVELS, LANGUAGES, LANG_SKILLS, RATIONALE_TYPES, REQUIRED_BY } from "./types";

const SELECT =
  "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/**
 * One task row. Unvalidated rows are editable and carry a "validoimaton"
 * label; approving freezes them until the employer chooses to edit again.
 * Locked (statutory) rows keep language, timing, grounds and the English
 * switch fixed; only the levels can move, and never to "not needed".
 */
export function TaskCard({
  task,
  rule,
  onChange,
  onRemove,
}: {
  task: LangTask;
  rule: RegulatedRule | null;
  onChange: (next: LangTask) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("langfit");
  const locale = useLocale() as "fi" | "en";
  const warnings = taskWarnings(task).filter((w) => w !== "unvalidated");
  const editable = !task.validated;
  const set = (patch: Partial<LangTask>) => onChange({ ...task, ...patch });
  const setLevel = (s: LangSkill, v: Level) => set({ levels: { ...task.levels, [s]: v } });
  const canApprove = task.description.trim().length > 0 && !warnings.includes("noLevels");

  return (
    <Card className={cn(!task.validated && "border-dashed border-[color:var(--gap)]")}>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {task.origin === "ai" && (
            <Badge variant="secondary">
              <Sparkles className="h-3 w-3" /> {t("origin.ai")}
            </Badge>
          )}
          {task.origin !== "ai" && <Badge variant="muted">{t(`origin.${task.origin}`)}</Badge>}
          {task.locked && rule && (
            <Badge variant="outline" title={rule.statute[locale]}>
              <Lock className="h-3 w-3" /> {t("locked")}
            </Badge>
          )}
          {task.validated ? (
            <Badge className="border-transparent bg-[color:var(--have)] text-[color:var(--have-foreground)]">
              <Check className="h-3 w-3" /> {t("validated")}
            </Badge>
          ) : (
            <Badge variant="gap">{t("unvalidated")}</Badge>
          )}
          <div className="ml-auto flex gap-1">
            {task.validated ? (
              <Button size="sm" variant="ghost" onClick={() => set({ validated: false })}>
                <Pencil className="h-3.5 w-3.5" /> {t("edit")}
              </Button>
            ) : (
              <Button size="sm" onClick={() => set({ validated: true })} disabled={!canApprove}>
                <Check className="h-3.5 w-3.5" /> {t("approve")}
              </Button>
            )}
            {!task.locked && (
              <Button size="icon" variant="ghost" onClick={onRemove} aria-label={t("remove")}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{t("field.description")}</span>
          <input
            value={task.description}
            onChange={(e) => set({ description: e.target.value })}
            disabled={!editable || task.locked}
            maxLength={500}
            className={cn(SELECT, "h-9")}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t("field.language")}</span>
            <select
              className={SELECT}
              value={task.language}
              disabled={!editable}
              onChange={(e) => set({ language: e.target.value as Lang })}
            >
              {LANGUAGES.filter((l) => !task.locked || l !== "en").map((l) => (
                <option key={l} value={l}>
                  {t(`lang.${l}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t("field.requiredBy")}</span>
            <select
              className={SELECT}
              value={task.requiredBy}
              disabled={!editable || task.locked}
              onChange={(e) => set({ requiredBy: e.target.value as RequiredBy })}
            >
              {REQUIRED_BY.map((b) => (
                <option key={b} value={b}>
                  {t(`by.${b}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t("field.rationaleType")}</span>
            <select
              className={SELECT}
              value={task.rationaleType}
              disabled={!editable || task.locked}
              onChange={(e) => set({ rationaleType: e.target.value as RationaleType })}
            >
              {RATIONALE_TYPES.map((r) => (
                <option key={r} value={r}>
                  {t(`rationale.${r}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <legend className="sr-only">{t("field.levels")}</legend>
          {LANG_SKILLS.map((s) => (
            <label key={s} className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t(`skill.${s}`)}</span>
              <select
                className={SELECT}
                value={task.levels[s] ?? ""}
                disabled={!editable}
                onChange={(e) => setLevel(s, (e.target.value || null) as Level)}
              >
                {!task.locked && <option value="">{t("levelNone")}</option>}
                {CEFR_LEVELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{t("field.rationale")}</span>
          <textarea
            value={task.rationale}
            onChange={(e) => set({ rationale: e.target.value })}
            disabled={!editable || task.locked}
            rows={2}
            maxLength={2000}
            placeholder={t("field.rationalePlaceholder")}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
        </label>

        {task.language !== "en" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={task.englishSufficient}
              disabled={!editable || task.locked}
              onChange={(e) => set({ englishSufficient: e.target.checked })}
              className="h-4 w-4"
            />
            {t("field.englishSufficient")}
          </label>
        )}

        {task.locked && rule && <p className="text-xs text-muted-foreground">{t("lockedHint", { statute: rule.statute[locale] })}</p>}

        {warnings.length > 0 && (
          <ul className="space-y-1">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5 text-xs text-[color:var(--gap)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t(`warning.${w}`)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
