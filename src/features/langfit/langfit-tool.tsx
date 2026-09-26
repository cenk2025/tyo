"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sparkles, Loader2, Plus, Save, Check, FilePlus2, Briefcase, UserRound } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { applyRules, detectRegulated, getRule, REGULATED_RULES } from "./rules";
import { sampleDraft, SAMPLE_KEYS } from "./samples";
import { saveAnalysisAction, suggestTasksAction } from "./actions";
import { TaskCard } from "./task-editor";
import { OutputsPanel } from "./outputs-panel";
import { SeekerCheck } from "./seeker-check";
import type { LangTask, LangfitDraft, RegulatedKey } from "./types";
import { emptyLevels, newTaskId } from "./types";

type L = "fi" | "en";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The LangFit demo: employer side (ad → tasks → validated rows → outputs) and,
 * on the second tab, the same posting seen by a job seeker. All AI output
 * arrives unvalidated and nothing is saved until the employer approves it.
 */
export function LangfitTool({
  initial,
  analysisId,
  signedIn,
  aiAvailable,
}: {
  initial: LangfitDraft | null;
  analysisId: string | null;
  signedIn: boolean;
  aiAvailable: boolean;
}) {
  const t = useTranslations("langfit");
  const locale = useLocale() as L;
  const router = useRouter();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [adText, setAdText] = useState(initial?.adText ?? "");
  const [regulated, setRegulatedState] = useState<RegulatedKey | null>(initial?.regulated ?? null);
  const [tasks, setTasksState] = useState<LangTask[]>(() =>
    applyRules(initial?.tasks ?? [], initial?.regulated ?? null, locale)
  );
  // Cleared when a sample replaces the loaded analysis, so saving creates a new one.
  const [currentId, setCurrentId] = useState<string | null>(analysisId);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [suggesting, startSuggest] = useTransition();
  const [saving, startSave] = useTransition();

  const draft: LangfitDraft = { title, adText, regulated, tasks };
  const detected = useMemo(() => detectRegulated(adText), [adText]);
  const validatedCount = tasks.filter((x) => x.validated).length;

  // Every task-list change goes through the rule layer.
  function setTasks(next: LangTask[], reg: RegulatedKey | null = regulated) {
    setTasksState(applyRules(next, reg, locale));
    setSaveMessage(null);
  }
  function setRegulated(reg: RegulatedKey | null) {
    setRegulatedState(reg);
    setTasks(tasks, reg);
  }

  function loadSample(key: string) {
    const s = sampleDraft(key, locale);
    if (!s) return;
    setTitle(s.title);
    setAdText(s.adText);
    setRegulatedState(s.regulated);
    setTasks(s.tasks, s.regulated);
    setCurrentId(null);
    setAiMessage(null);
  }

  function suggest() {
    setAiMessage(null);
    startSuggest(async () => {
      const res = await suggestTasksAction(adText, locale);
      if (res.ok) {
        // AI rows replace earlier unvalidated suggestions; approved rows stay.
        setTasks([...tasks.filter((x) => x.validated || x.locked), ...res.tasks]);
      } else {
        setAiMessage(t(`ai.${res.error}`));
      }
    });
  }

  function addManual() {
    setTasks([
      ...tasks,
      {
        id: newTaskId(),
        description: "",
        language: "fi",
        levels: emptyLevels(),
        requiredBy: "day1",
        rationaleType: "none",
        rationale: "",
        englishSufficient: false,
        origin: "human",
        validated: false,
        locked: false,
      },
    ]);
  }

  function save() {
    startSave(async () => {
      const res = await saveAnalysisAction({
        id: currentId,
        title: title || t("untitled"),
        adText,
        regulated,
        locale,
        tasks,
      });
      if (res.ok) {
        setSaveMessage(t("save.saved"));
        router.replace(`/langfit?a=${res.id}`);
        router.refresh();
      } else {
        setSaveMessage(res.error === "noValidated" ? t("save.noValidated") : t("save.error"));
      }
    });
  }

  function reset() {
    setTitle("");
    setAdText("");
    setRegulatedState(null);
    setTasksState([]);
    setAiMessage(null);
    router.replace("/langfit");
  }

  return (
    <Tabs defaultValue="employer">
      <TabsList className="mb-4">
        <TabsTrigger value="employer" className="gap-1.5">
          <Briefcase className="h-4 w-4" /> {t("tabEmployer")}
        </TabsTrigger>
        <TabsTrigger value="seeker" className="gap-1.5">
          <UserRound className="h-4 w-4" /> {t("tabSeeker")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="employer" className="space-y-6">
        {/* Step 1 — the ad */}
        <Card>
          <CardHeader>
            <CardTitle>{t("step1.title")}</CardTitle>
            <CardDescription>{t("step1.hint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("step1.samples")}</span>
              {SAMPLE_KEYS.map((k) => (
                <Button key={k} variant="outline" size="sm" onClick={() => loadSample(k)}>
                  {sampleDraft(k, locale)?.title}
                </Button>
              ))}
              {(currentId || tasks.length > 0) && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  <FilePlus2 className="h-4 w-4" /> {t("newAnalysis")}
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-title">{t("step1.titleLabel")}</Label>
              <Input id="lf-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-ad">{t("step1.adLabel")}</Label>
              <textarea
                id="lf-ad"
                value={adText}
                onChange={(e) => setAdText(e.target.value)}
                placeholder={t("step1.adPlaceholder")}
                rows={6}
                maxLength={20000}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-reg">{t("step1.regulatedLabel")}</Label>
              <select
                id="lf-reg"
                className={SELECT}
                value={regulated ?? ""}
                onChange={(e) => setRegulated((e.target.value || null) as RegulatedKey | null)}
              >
                <option value="">{t("step1.regulatedNone")}</option>
                {REGULATED_RULES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label[locale]}
                  </option>
                ))}
              </select>
              {detected && detected !== regulated && (
                <p className="text-xs text-muted-foreground">
                  {t("step1.regulatedDetected", { label: getRule(detected)!.label[locale] })}{" "}
                  <button type="button" className="font-medium text-primary underline" onClick={() => setRegulated(detected)}>
                    {t("step1.apply")}
                  </button>
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={suggest} disabled={!aiAvailable || suggesting || adText.trim().length < 40}>
                {suggesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("ai.working")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> {t("ai.suggest")}
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={addManual}>
                <Plus className="h-4 w-4" /> {t("addTask")}
              </Button>
            </div>
            {!aiAvailable && <p className="text-xs text-muted-foreground">{t("ai.unavailable")}</p>}
            {aiMessage && (
              <p role="status" className="text-sm text-[color:var(--gap)]">
                {aiMessage}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Step 2 — tasks */}
        {tasks.length > 0 && (
          <section aria-labelledby="lf-step2" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="lf-step2" className="text-lg font-semibold">
                {t("step2.title")}
              </h2>
              <span className="text-sm text-muted-foreground">
                {t("step2.count", { done: validatedCount, total: tasks.length })}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{t("step2.hint")}</p>
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                rule={task.locked ? getRule(regulated) : null}
                onChange={(next) => setTasks(tasks.map((x) => (x.id === task.id ? next : x)))}
                onRemove={() => setTasks(tasks.filter((x) => x.id !== task.id))}
              />
            ))}
          </section>
        )}

        {/* Step 3 — outputs */}
        {tasks.length > 0 && (
          <section aria-labelledby="lf-step3" className="space-y-3">
            <h2 id="lf-step3" className="text-lg font-semibold">
              {t("step3.title")}
            </h2>
            <OutputsPanel draft={draft} />
            <div className="flex flex-wrap items-center gap-3">
              {signedIn ? (
                <Button onClick={save} disabled={saving || validatedCount === 0}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saveMessage === t("save.saved") ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {t("save.button")}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">{t("save.loginToSave")}</p>
              )}
              {saveMessage && (
                <span role="status" className="text-sm text-muted-foreground">
                  {saveMessage}
                </span>
              )}
            </div>
          </section>
        )}
      </TabsContent>

      <TabsContent value="seeker">
        <SeekerCheck draft={draft} signedIn={signedIn} />
      </TabsContent>
    </Tabs>
  );
}
