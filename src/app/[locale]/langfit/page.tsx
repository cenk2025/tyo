import { setRequestLocale, getTranslations } from "next-intl/server";
import { Languages, ListChecks, FileText, ShieldAlert, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { isEmbeddingsConfigured } from "@/lib/flags";
import { LangfitTool } from "@/features/langfit/langfit-tool";
import { getAnalysis, listAnalyses } from "@/features/langfit/server";
import { deleteAnalysisAction } from "@/features/langfit/actions";

// The AI step can take over a minute on the free NVIDIA tier; Server Actions
// on this page inherit this limit.
export const maxDuration = 120;

export default async function LangfitPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ a?: string }>;
}) {
  const { locale } = await params;
  const { a } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("langfit");

  const user = await getCurrentUser();
  const [saved, loaded] = user
    ? await Promise.all([listAnalyses(), a ? getAnalysis(a) : Promise.resolve(null)])
    : [[], null];

  const steps = [
    { icon: ListChecks, title: t("intro.step1Title"), body: t("intro.step1Body") },
    { icon: Languages, title: t("intro.step2Title"), body: t("intro.step2Body") },
    { icon: FileText, title: t("intro.step3Title"), body: t("intro.step3Body") },
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
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="font-medium">{t("notice.title")}</p>
            <p className="text-muted-foreground">{t("notice.body")}</p>
          </div>
        </div>

        {user && saved.length > 0 && (
          <section aria-labelledby="lf-saved" className="mb-8">
            <h2 id="lf-saved" className="mb-2 text-sm font-semibold">
              {t("saved.title")}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {saved.map((s) => (
                <li key={s.id} className="flex items-center rounded-md border text-sm">
                  <Link href={`/langfit?a=${s.id}`} className="px-3 py-1.5 hover:bg-accent">
                    {s.title}{" "}
                    <span className="text-muted-foreground">({t("saved.tasks", { count: s.taskCount })})</span>
                  </Link>
                  <form
                    action={async () => {
                      "use server";
                      await deleteAnalysisAction(s.id);
                    }}
                  >
                    <button type="submit" className="px-2 py-1.5 text-muted-foreground hover:text-destructive" aria-label={t("remove")}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        <LangfitTool
          key={loaded?.id ?? "new"}
          initial={loaded}
          analysisId={loaded?.id ?? null}
          signedIn={Boolean(user)}
          aiAvailable={isEmbeddingsConfigured()}
        />
      </main>
    </div>
  );
}
