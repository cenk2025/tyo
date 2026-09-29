import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowRight, BookOpen, Handshake, Route, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOccupationByCode } from "@/lib/esco/queries";
import type { Locale } from "@/lib/esco/types";
import { buildOnboardingPlan } from "@/features/perehdytys/server";
import { RolePicker } from "@/features/perehdytys/role-picker";
import { PlanActions } from "@/features/perehdytys/plan-actions";
import { planText, qualificationType } from "@/features/perehdytys/text";
import type { PlanSkill } from "@/features/perehdytys/plan";
import { cn } from "@/lib/utils";

/** Real ESCO occupation codes, checked against the live database. */
const SAMPLES = [
  { from: "0b15375e-dfdd-4047-9efb-096e0aaee7d2", to: "bea705fe-06ac-4147-b8e0-6e8ac1208d8f" }, // shop assistant → warehouse worker
  { from: "303a1e34-cb16-4054-b323-81e5eec17397", to: "d38c2107-98f2-47b7-8bb4-f69750d51082" }, // building cleaner → healthcare assistant
  { from: "d5db9d5c-2ebf-4a54-a79a-1b7e7ff70471", to: "90f75f67-495d-49fa-ab57-2f320e251d7e" }, // waiter/waitress → cook
];

const CODE = /^[0-9a-z-]{4,64}$/i;

export default async function OnboardingPathPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ to?: string; from?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations("onboardPath");

  const toCode = sp.to && CODE.test(sp.to) ? sp.to : null;
  const fromCode = sp.from && CODE.test(sp.from) ? sp.from : null;

  const [plan, samples] = await Promise.all([
    toCode ? buildOnboardingPlan(toCode, fromCode, loc) : Promise.resolve(null),
    Promise.all(
      SAMPLES.map(async (s) => {
        const [from, to] = await Promise.all([getOccupationByCode(s.from, loc), getOccupationByCode(s.to, loc)]);
        return from && to ? { ...s, fromLabel: from.label, toLabel: to.label } : null;
      })
    ),
  ]);

  const covered = plan ? plan.units.reduce((n, u) => n + u.skills.length, 0) : 0;
  const steps = [
    { icon: Route, title: t("intro.step1Title"), body: t("intro.step1Body") },
    { icon: Handshake, title: t("intro.step2Title"), body: t("intro.step2Body") },
    { icon: BookOpen, title: t("intro.step3Title"), body: t("intro.step3Body") },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <header className="mb-6 space-y-2 print:hidden">
          <p className="text-sm font-medium text-primary">{t("eyebrow")}</p>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="max-w-3xl text-muted-foreground">{t("subtitle")}</p>
        </header>

        <div className="mb-6 grid gap-3 md:grid-cols-3 print:hidden">
          {steps.map((s) => (
            <Card key={s.title}>
              <CardContent className="flex gap-3 pt-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">{s.title}</h2>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div role="note" className="mb-8 flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm print:hidden">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="font-medium">{t("notice.title")}</p>
            <p className="text-muted-foreground">{t("notice.body")}</p>
          </div>
        </div>

        <Card className="mb-8 print:hidden">
          <CardHeader>
            <CardTitle>{t("picker.title")}</CardTitle>
            <CardDescription>{t("picker.hint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RolePicker
              key={`${toCode}-${fromCode}`}
              initialTo={plan ? { code: plan.to.code, label: plan.to.label } : null}
              initialFrom={plan?.from ? { code: plan.from.code, label: plan.from.label } : null}
            />
            {samples.some(Boolean) && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("picker.samples")}</span>
                {samples.map(
                  (s) =>
                    s && (
                      <Link
                        key={s.to}
                        href={`/perehdytys?to=${s.to}&from=${s.from}`}
                        className="rounded-md border px-3 py-1.5 hover:bg-accent"
                      >
                        {s.fromLabel} → {s.toLabel}
                      </Link>
                    )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {toCode && !plan && <p className="text-sm text-muted-foreground">{t("noPlan")}</p>}

        {plan && (
          <section aria-labelledby="op-plan" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="op-plan" className="text-2xl font-bold tracking-tight">
                  {plan.from ? `${plan.from.label} → ${plan.to.label}` : plan.to.label}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("summary", { have: plan.strengths.length, total: plan.totalEssential })}
                </p>
              </div>
              <PlanActions text={planText(plan, loc, new Date())} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Stat value={`${plan.strengths.length}/${plan.totalEssential}`} label={t("stats.have")} />
              <Stat value={String(plan.onTheJob.length)} label={t("stats.onTheJob")} />
              <Stat value={`${plan.units.length}`} label={t("stats.units", { count: covered })} />
            </div>

            <Phase n={1} title={t("phase1.title")} when={t("phase1.when")} hint={t("phase1.hint")}>
              <SkillChips skills={plan.strengths} variant="have" empty={t("phase1.empty")} />
            </Phase>

            <Phase n={2} title={t("phase2.title")} when={t("phase2.when")} hint={t("phase2.hint")}>
              <SkillChips skills={plan.onTheJob} variant="gap" empty={t("phase2.empty")} />
            </Phase>

            <Phase n={3} title={t("phase3.title")} when={t("phase3.when")} hint={t("phase3.hint")}>
              {plan.units.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("phase3.empty")}</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {plan.units.map((u) => (
                    <Card key={u.key}>
                      <CardContent className="space-y-2 pt-4">
                        <p className="font-semibold">{u.title}</p>
                        <Link href={`/education/${u.program.id}`} className="text-sm text-primary hover:underline">
                          {u.program.label}
                          <span className="text-muted-foreground"> · {qualificationType(u.program.koulutustyyppi, loc)}</span>
                          <ArrowRight className="ml-1 inline h-3.5 w-3.5 align-[-2px]" />
                        </Link>
                        <p className="text-xs font-medium text-muted-foreground">{t("phase3.covers", { count: u.skills.length })}</p>
                        <SkillChips skills={u.skills} variant="muted" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              {loc === "en" && plan.units.length > 0 && <p className="text-xs text-muted-foreground">{t("phase3.finnishOnly")}</p>}
            </Phase>

            {plan.later.length > 0 && (
              <Phase n={4} title={t("phase4.title")} when={t("phase4.when")} hint={t("phase4.hint")}>
                <SkillChips skills={plan.later} variant="muted" />
              </Phase>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4 text-primary" /> {t("funding.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <strong>{t("funding.apprenticeshipTitle")}</strong> {t("funding.apprenticeship")}
                </p>
                <p>
                  <strong>{t("funding.jointTitle")}</strong> {t("funding.joint")}
                </p>
                <p className="text-muted-foreground">{t("funding.check")}</p>
              </CardContent>
            </Card>

            <Link href="/langfit" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline print:hidden">
              <Sparkles className="h-4 w-4" /> {t("langfitLink")}
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-3xl font-bold text-primary">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function Phase({
  n,
  title,
  when,
  hint,
  children,
}: {
  n: number;
  title: string;
  when: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {n}
        </span>
        <h3 className="text-lg font-semibold">{title}</h3>
        <Badge variant="outline">{when}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{hint}</p>
      {children}
    </section>
  );
}

function SkillChips({
  skills,
  variant,
  empty,
}: {
  skills: PlanSkill[];
  variant: "have" | "gap" | "muted";
  empty?: string;
}) {
  if (skills.length === 0) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <li key={s.uri}>
          <Link href={`/skill/${encodeURIComponent(s.uri)}`}>
            <Badge
              variant={variant === "have" ? undefined : variant}
              className={cn(
                "text-sm font-normal hover:opacity-80",
                // The shared "have" badge is too faint for body-size text; use the solid token.
                variant === "have" && "border-transparent bg-[color:var(--have)] text-[color:var(--have-foreground)]"
              )}
            >
              {s.label}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
