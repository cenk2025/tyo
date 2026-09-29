import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Compass, Layers, Megaphone, Route, ShieldCheck, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOccupationByCode } from "@/lib/esco/queries";
import { majorGroupLabel, majorGroupOf } from "@/lib/esco/isco";
import type { Locale } from "@/lib/esco/types";
import { adSnippet, findHiddenTalent } from "@/features/piilo-osaajat/server";
import { TargetPicker } from "@/features/piilo-osaajat/target-picker";
import { CopyText } from "@/features/piilo-osaajat/copy-text";
import { cn } from "@/lib/utils";

/** Real ESCO occupation codes, checked against the live database. */
const SAMPLES = [
  "bea705fe-06ac-4147-b8e0-6e8ac1208d8f", // warehouse worker
  "90f75f67-495d-49fa-ab57-2f320e251d7e", // cook
  "d38c2107-98f2-47b7-8bb4-f69750d51082", // healthcare assistant
  "00cee175-1376-43fb-9f02-ba3d7a910a58", // bus driver
];

const CODE = /^[0-9a-z-]{4,64}$/i;

export default async function HiddenTalentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ to?: string; from?: string; all?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations("hiddenTalent");

  const toCode = sp.to && CODE.test(sp.to) ? sp.to : null;
  const fromCode = sp.from && CODE.test(sp.from) ? sp.from : null;
  const includeSame = sp.all === "1";

  const [result, samples] = await Promise.all([
    toCode ? findHiddenTalent(toCode, includeSame, loc) : Promise.resolve(null),
    Promise.all(SAMPLES.map((c) => getOccupationByCode(c, loc))),
  ]);

  const base = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ to: toCode ?? "", ...(includeSame ? { all: "1" } : {}), ...extra });
    return `/piilo-osaajat?${q.toString()}`;
  };
  const selected = result?.candidates.find((c) => c.code === fromCode) ?? null;
  const targetMajor = majorGroupOf(result?.target.iscoGroup);
  const top3 = result?.candidates.slice(0, 3) ?? [];

  const steps = [
    { icon: Compass, title: t("intro.step1Title"), body: t("intro.step1Body") },
    { icon: Users, title: t("intro.step2Title"), body: t("intro.step2Body") },
    { icon: Route, title: t("intro.step3Title"), body: t("intro.step3Body") },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <header className="mb-6 space-y-2">
          <p className="text-sm font-medium text-primary">{t("eyebrow")}</p>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="max-w-3xl text-muted-foreground">{t("subtitle")}</p>
        </header>

        <div className="mb-6 grid gap-3 md:grid-cols-3">
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

        <div role="note" className="mb-8 flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="font-medium">{t("notice.title")}</p>
            <p className="text-muted-foreground">{t("notice.body")}</p>
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t("picker.title")}</CardTitle>
            <CardDescription>{t("picker.hint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TargetPicker />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("picker.samples")}</span>
              {samples.map(
                (o) =>
                  o && (
                    <Link key={o.code} href={`/piilo-osaajat?to=${o.code}`} className="rounded-md border px-3 py-1.5 hover:bg-accent">
                      {o.label}
                    </Link>
                  )
              )}
            </div>
          </CardContent>
        </Card>

        {toCode && !result && <p className="text-sm text-muted-foreground">{t("notFound")}</p>}

        {result && (
          <section aria-labelledby="ht-results" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="ht-results" className="text-2xl font-bold tracking-tight">
                  {t("resultsTitle", { role: result.target.label })}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("resultsSubtitle", { count: result.essential.length })}
                </p>
              </div>
              <Link href={includeSame ? `/piilo-osaajat?to=${toCode}` : `/piilo-osaajat?to=${toCode}&all=1`} className="text-sm text-primary hover:underline">
                {includeSame ? t("hideSameGroup") : t("showSameGroup")}
              </Link>
            </div>

            {result.candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              <ol className="grid gap-3 md:grid-cols-2">
                {result.candidates.map((c, i) => {
                  const pct = c.total ? Math.round((c.shared / c.total) * 100) : 0;
                  const major = majorGroupOf(c.iscoGroup);
                  const active = c.code === fromCode;
                  return (
                    <li key={c.code}>
                      <Card className={cn("h-full", active && "border-primary ring-1 ring-primary")}>
                        <CardContent className="space-y-3 pt-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs text-muted-foreground">#{i + 1}</p>
                              <p className="font-semibold">{c.label}</p>
                            </div>
                            <span className="text-2xl font-bold text-primary">{pct}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {t("sharedOf", { shared: c.shared, total: c.total })}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="muted">{majorGroupLabel(major, loc)}</Badge>
                            {major !== targetMajor && <Badge variant="outline">{t("otherField")}</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button asChild size="sm" variant={active ? "secondary" : "outline"}>
                              <Link href={`${base({ from: c.code })}#ht-detail`} scroll={false}>
                                {t("showDiff")}
                              </Link>
                            </Button>
                            <Button asChild size="sm" variant="ghost">
                              <Link href={`/perehdytys?to=${toCode}&from=${c.code}`}>
                                {t("toPlan")} <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ol>
            )}

            {selected && (
              <Card id="ht-detail" className="scroll-mt-20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Layers className="h-4 w-4 text-primary" />
                    {t("detailTitle", { from: selected.label, to: result.target.label })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-medium">{t("sharedSkills", { count: selected.shared })}</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {result.essential
                        .filter((s) => selected.sharedUris.includes(s.conceptUri))
                        .map((s) => (
                          <li key={s.conceptUri}>
                            <Badge className="border-transparent bg-[color:var(--have)] text-sm font-normal text-[color:var(--have-foreground)]">
                              {s.label}
                            </Badge>
                          </li>
                        ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">
                      {t("missingSkills", { count: selected.total - selected.shared })}
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {result.essential
                        .filter((s) => !selected.sharedUris.includes(s.conceptUri))
                        .map((s) => (
                          <li key={s.conceptUri}>
                            <Badge variant="gap" className="text-sm font-normal">
                              {s.label}
                            </Badge>
                          </li>
                        ))}
                    </ul>
                  </div>
                  <Button asChild>
                    <Link href={`/perehdytys?to=${toCode}&from=${selected.code}`}>
                      {t("toPlanLong")} <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {top3.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Megaphone className="h-4 w-4 text-primary" /> {t("adTitle")}
                  </CardTitle>
                  <CardDescription>{t("adHint")}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <CopyText label="Suomeksi" text={adSnippet(top3.map((c) => c.labelFi), "fi")} />
                  <CopyText label="In English" text={adSnippet(top3.map((c) => c.labelEn), "en")} />
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground">{t("method")}</p>
          </section>
        )}
      </main>
    </div>
  );
}
