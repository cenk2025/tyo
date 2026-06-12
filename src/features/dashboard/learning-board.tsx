"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  setLearningStatus,
  removeFromLearningList,
} from "@/lib/db/mutations";
import type { LearningItem } from "@/lib/db/queries";
import type { LearningStatus } from "@/lib/db/types";

const COLUMNS: LearningStatus[] = ["planned", "in_progress", "done"];

/** Kanban-style learning list. Moving to "done" adds the skill to the profile. */
export function LearningBoard({ items }: { items: LearningItem[] }) {
  const t = useTranslations("learning");
  const [isPending, startTransition] = useTransition();

  const grouped: Record<LearningStatus, LearningItem[]> = {
    planned: [],
    in_progress: [],
    done: [],
  };
  for (const item of items) grouped[item.status].push(item);

  function move(skillUri: string, status: LearningStatus) {
    startTransition(() => {
      void setLearningStatus(skillUri, status);
    });
  }
  function remove(skillUri: string) {
    startTransition(() => {
      void removeFromLearningList(skillUri);
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {COLUMNS.map((col) => (
        <div key={col} className="rounded-lg border bg-muted/30 p-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(col === "in_progress" ? "inProgress" : col)}
            </span>
            <Badge variant="muted">{grouped[col].length}</Badge>
          </div>
          <ul className="space-y-2">
            {grouped[col].map((item) => (
              <li
                key={item.conceptUri}
                className="rounded-md border bg-card p-2 text-sm shadow-sm"
              >
                <p className="mb-2 line-clamp-2 font-medium">{item.label}</p>
                <div className="flex items-center gap-1">
                  {col !== "planned" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={isPending}
                      aria-label={t("markPlanned")}
                      onClick={() =>
                        move(
                          item.conceptUri,
                          col === "done" ? "in_progress" : "planned"
                        )
                      }
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {col === "planned" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={isPending}
                      onClick={() => move(item.conceptUri, "in_progress")}
                    >
                      {t("markInProgress")} <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                  {col === "in_progress" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-have"
                      disabled={isPending}
                      onClick={() => move(item.conceptUri, "done")}
                    >
                      <Check className="h-3 w-3" /> {t("markDone")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7 text-muted-foreground"
                    disabled={isPending}
                    aria-label={t("markPlanned")}
                    onClick={() => remove(item.conceptUri)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
