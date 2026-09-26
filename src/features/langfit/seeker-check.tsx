"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, XCircle, Globe, Plus, Check, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addToLearningList } from "@/lib/db/mutations";
import { languageSkillUrisAction } from "./actions";
import type { LangSkill, LangTask, Level, LangfitDraft } from "./types";
import { CEFR_LEVELS, LANG_SKILLS, levelRank } from "./types";

type Status = "ok" | "learn" | "gap" | "english";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function statusOf(task: LangTask, self: Record<LangSkill, Level>): Status {
  if (task.englishSufficient) return "english";
  const short = LANG_SKILLS.some((s) => levelRank(self[s]) < levelRank(task.levels[s]));
  if (!short) return "ok";
  return task.requiredBy === "day1" ? "gap" : "learn";
}

/**
 * The job seeker's view of the same approved posting. Self-assessment covers
 * the four areas Kielibuusti's tool measures; it stays in this component's
 * state — never saved, never sent to the employer. The comparison is plain
 * arithmetic on levels, not AI, and only ever informs the seeker.
 */
export function SeekerCheck({ draft, signedIn }: { draft: LangfitDraft; signedIn: boolean }) {
  const t = useTranslations("langfit.seeker");
  const tl = useTranslations("langfit");
  const [lang, setLang] = useState<"fi" | "sv">("fi");
  const [self, setSelf] = useState<Record<LangSkill, Level>>({
    listening: null,
    reading: null,
    speaking: null,
    writing: null,
  });

  const tasks = draft.tasks.filter((x) => x.validated && x.language === lang);
  if (!draft.tasks.some((x) => x.validated)) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">{t("noPosting")}</CardContent>
      </Card>
    );
  }

  const statuses = tasks.map((task) => ({ task, status: statusOf(task, self) }));
  const canStart = !statuses.some((s) => s.status === "gap");

  // Highest level needed per skill across rows the seeker falls short on.
  const gaps = LANG_SKILLS.flatMap((s) => {
    const needed = statuses
      .filter((x) => x.status === "gap" || x.status === "learn")
      .map((x) => x.task.levels[s])
      .reduce<Level>((a, b) => (levelRank(b) > levelRank(a) ? b : a), null);
    return levelRank(needed) > levelRank(self[s]) ? [{ skill: s, have: self[s], need: needed }] : [];
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title", { job: draft.title || tl("untitled") })}</CardTitle>
          <CardDescription>{t("intro")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-[color:var(--have)]" /> {t("privacy")}
          </p>
          <label className="block max-w-xs space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t("language")}</span>
            <select className={SELECT} value={lang} onChange={(e) => setLang(e.target.value as "fi" | "sv")}>
              <option value="fi">{tl("lang.fi")}</option>
              <option value="sv">{tl("lang.sv")}</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {LANG_SKILLS.map((s) => (
              <label key={s} className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{tl(`skill.${s}`)}</span>
                <select
                  className={SELECT}
                  value={self[s] ?? ""}
                  onChange={(e) => setSelf({ ...self, [s]: (e.target.value || null) as Level })}
                >
                  <option value="">{t("notYet")}</option>
                  {CEFR_LEVELS.map((c) => (
                    <option key={c} value={c}>
                      {c} – {t(`can.${c}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noTasksInLanguage")}</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {canStart ? (
                <CheckCircle2 className="h-5 w-5 text-[color:var(--have)]" />
              ) : (
                <XCircle className="h-5 w-5 text-[color:var(--gap)]" />
              )}
              {canStart ? t("canStart") : t("cannotStart")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {statuses.map(({ task, status }) => (
                <li key={task.id} className="flex items-start gap-2 text-sm">
                  <StatusIcon status={status} />
                  <span>
                    <span className="font-medium">{task.description}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      – {t(`status.${status}`, { by: tl(`by.${task.requiredBy}`) })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {gaps.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium">{t("gapsTitle")}</p>
                <ul className="space-y-2">
                  {gaps.map((g) => (
                    <li key={g.skill} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        {tl(`skill.${g.skill}`)}: {g.have ?? "–"} → <strong>{g.need}</strong>
                      </span>
                      {signedIn && <LearnButton lang={lang} skill={g.skill} />}
                    </li>
                  ))}
                </ul>
                {!signedIn && <p className="text-xs text-muted-foreground">{t("loginForLearning")}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">{t("externalNote")}</p>
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  const cls = "mt-0.5 h-4 w-4 shrink-0";
  if (status === "ok") return <CheckCircle2 className={`${cls} text-[color:var(--have)]`} />;
  if (status === "learn") return <Clock className={`${cls} text-primary`} />;
  if (status === "english") return <Globe className={`${cls} text-muted-foreground`} />;
  return <XCircle className={`${cls} text-[color:var(--gap)]`} />;
}

/** Resolves the ESCO language skill behind a gap and puts it on the learning list. */
function LearnButton({ lang, skill }: { lang: "fi" | "sv"; skill: LangSkill }) {
  const t = useTranslations("langfit.seeker");
  const [state, setState] = useState<"idle" | "added" | "missing">("idle");
  const [pending, start] = useTransition();
  function add() {
    start(async () => {
      const uris = await languageSkillUrisAction(lang, [skill]);
      const uri = uris[skill];
      if (!uri) return setState("missing");
      const res = await addToLearningList(uri);
      setState(res.ok ? "added" : "missing");
    });
  }
  if (state === "missing") return <span className="text-xs text-muted-foreground">{t("notFound")}</span>;
  return (
    <Button size="sm" variant={state === "added" ? "secondary" : "outline"} disabled={pending || state === "added"} onClick={add}>
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : state === "added" ? (
        <>
          <Check className="h-3.5 w-3.5" /> {t("inLearning")}
        </>
      ) : (
        <>
          <Plus className="h-3.5 w-3.5" /> {t("addToLearning")}
        </>
      )}
    </Button>
  );
}
