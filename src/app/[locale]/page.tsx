import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Compass, Target, TrendingUp, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const tApp = await getTranslations("app");

  const features = [
    { icon: Compass, title: t("feature1Title"), body: t("feature1Body") },
    { icon: Target, title: t("feature2Title"), body: t("feature2Body") },
    { icon: TrendingUp, title: t("feature3Title"), body: t("feature3Body") },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent)]"
          />
          <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:py-28">
            <p className="mb-4 text-sm font-medium text-primary">{tApp("tagline")}</p>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              {t("heroTitle")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
              {t("heroSubtitle")}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/signup">
                  {t("heroCtaPrimary")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/occupations">{t("heroCtaSecondary")}</Link>
              </Button>
            </div>
            <p className="mt-8 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-have" />
              {t("trustNote")}
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="h-full">
                <CardContent className="pt-6">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-24">
          <Card className="overflow-hidden border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col items-center gap-6 px-6 py-12 text-center md:flex-row md:justify-between md:text-left">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">{t("ctaTitle")}</h2>
                <p className="mt-2 max-w-xl text-muted-foreground">{t("ctaBody")}</p>
              </div>
              <Button asChild size="lg" className="shrink-0">
                <Link href="/signup">
                  {t("ctaButton")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-muted-foreground">
          {tApp("name")} · {t("trustNote")}
        </div>
      </footer>
    </div>
  );
}
