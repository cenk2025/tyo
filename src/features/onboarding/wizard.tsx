"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Loader2, Check } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { OccupationSearch } from "@/features/explore/occupation-search";
import { SkillSearch } from "@/features/explore/skill-search";
import { getOccupationSkillsAction, completeOnboarding } from "./actions";
import type { Locale, Occupation, Skill, OccupationSkill } from "@/lib/esco/types";
import type { SkillSource } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type ChosenSkill = { skill: Skill; source: SkillSource };

export function OnboardingWizard({
  transversalSkills,
}: {
  transversalSkills: Skill[];
}) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState(1);
  const [currentOcc, setCurrentOcc] = useState<Occupation | null>(null);
  const [prefill, setPrefill] = useState<OccupationSkill[]>([]);
  const [loadingPrefill, setLoadingPrefill] = useState(false);
  const [skills, setSkills] = useState<Map<string, ChosenSkill>>(new Map());
  const [targets, setTargets] = useState<Map<string, Occupation>>(new Map());

  const selectedSkillUris = new Set(skills.keys());
  const selectedTargetUris = new Set(targets.keys());

  function addSkill(skill: Skill, source: SkillSource) {
    setSkills((prev) => new Map(prev).set(skill.conceptUri, { skill, source }));
  }
  function toggleSkill(skill: Skill, source: SkillSource) {
    setSkills((prev) => {
      const next = new Map(prev);
      if (next.has(skill.conceptUri)) next.delete(skill.conceptUri);
      else next.set(skill.conceptUri, { skill, source });
      return next;
    });
  }

  async function pickOccupation(occ: Occupation) {
    setCurrentOcc(occ);
    setLoadingPrefill(true);
    const occSkills = await getOccupationSkillsAction(occ.conceptUri, locale);
    setPrefill(occSkills.filter((s) => s.relationType === "essential"));
    setLoadingPrefill(false);
  }

  function toggleTarget(occ: Occupation) {
    setTargets((prev) => {
      const next = new Map(prev);
      if (next.has(occ.conceptUri)) next.delete(occ.conceptUri);
      else if (next.size < 3) next.set(occ.conceptUri, occ);
      return next;
    });
  }

  function finish() {
    startTransition(async () => {
      await completeOnboarding({
        currentOccupationUri: currentOcc?.conceptUri ?? null,
        skills: [...skills.values()].map((c) => ({
          skillUri: c.skill.conceptUri,
          source: c.source,
        })),
        targets: [...targets.keys()],
      });
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6">
        <p className="mb-2 text-sm text-muted-foreground">
          {t("stepOf", { current: step, total: 3 })}
        </p>
        <Progress value={(step / 3) * 100} />
      </div>

      {/* STEP 1 — current occupation + prefill essential skills */}
      {step === 1 && (
        <section className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold">{t("step1Title")}</h2>
            <p className="text-sm text-muted-foreground">{t("step1Subtitle")}</p>
          </header>

          <OccupationSearch onSelect={pickOccupation} />

          {currentOcc && (
            <div className="rounded-lg border p-4">
              <p className="mb-3 text-sm font-medium">
                {currentOcc.label} — {t("step1Prefill")}
              </p>
              {loadingPrefill ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {prefill.map((s) => {
                    const checked = skills.has(s.conceptUri);
                    return (
                      <button
                        key={s.conceptUri}
                        type="button"
                        onClick={() => toggleSkill(s, "occupation_prefill")}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                          checked
                            ? "border-have/50 bg-have/10"
                            : "hover:bg-accent"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            checked && "border-have bg-have text-have-foreground"
                          )}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{s.label}</span>
                      </button>
                    );
                  })}
                  {prefill.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {tc("noResults")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* STEP 2 — add more skills + transversal grid */}
      {step === 2 && (
        <section className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold">{t("step2Title")}</h2>
            <p className="text-sm text-muted-foreground">{t("step2Subtitle")}</p>
          </header>

          <SkillSearch
            onSelect={(s) => addSkill(s, "search")}
            selectedUris={selectedSkillUris}
          />

          <div>
            <p className="mb-2 text-sm font-medium">{t("step2Transversal")}</p>
            <div className="flex flex-wrap gap-2">
              {transversalSkills.map((s) => {
                const checked = skills.has(s.conceptUri);
                return (
                  <button
                    key={s.conceptUri}
                    type="button"
                    onClick={() => toggleSkill(s, "transversal")}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      checked
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:bg-accent"
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {t("selectedSkills", { count: skills.size })}
          </p>
        </section>
      )}

      {/* STEP 3 — target occupations */}
      {step === 3 && (
        <section className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold">{t("step3Title")}</h2>
            <p className="text-sm text-muted-foreground">{t("step3Subtitle")}</p>
          </header>

          <OccupationSearch
            onSelect={toggleTarget}
            selectedUris={selectedTargetUris}
          />

          {targets.size > 0 && (
            <div className="flex flex-wrap gap-2">
              {[...targets.values()].map((o) => (
                <Badge key={o.conceptUri} variant="secondary" className="gap-1">
                  {o.label}
                  <button
                    type="button"
                    onClick={() => toggleTarget(o)}
                    aria-label={tc("remove")}
                    className="ml-1"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {t("selectedTargets", { count: targets.size })}
          </p>
        </section>
      )}

      {/* Footer nav */}
      <div className="mt-8 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => (step === 1 ? finish() : setStep((s) => s - 1))}
          disabled={isPending}
        >
          {step === 1 ? (
            tc("skip")
          ) : (
            <>
              <ArrowLeft className="h-4 w-4" /> {tc("back")}
            </>
          )}
        </Button>

        {step < 3 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={isPending}>
            {tc("continue")} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={finish} disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("finishButton")
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
