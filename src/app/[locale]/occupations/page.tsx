import { setRequestLocale, getTranslations } from "next-intl/server";
import { Search, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { listOccupations } from "@/lib/esco/queries";
import type { Locale } from "@/lib/esco/types";
import { majorGroupOf, majorGroupLabel } from "@/lib/esco/isco";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;

export default async function OccupationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { q = "", page: pageStr } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("explore");

  const page = Math.max(1, Number(pageStr) || 1);
  const { items, total } = await listOccupations(
    locale as Locale,
    page,
    PAGE_SIZE,
    q
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{t("occupationsTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("occupationsSubtitle")}
          </p>
        </header>

        {/* Search (GET form, server-side) */}
        <form className="mb-6 flex gap-2" action="" method="get">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t("searchOccupations")}
              className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Button type="submit">{t("searchOccupations")}</Button>
        </form>

        <p className="mb-3 text-sm text-muted-foreground">
          {t("resultsCount", { count: total })}
        </p>

        <ul className="space-y-2">
          {items.map((occ) => {
            const grp = majorGroupOf(occ.iscoGroup);
            return (
              <li key={occ.conceptUri}>
                <Link href={`/occupation/${occ.code}`}>
                  <Card className="transition-colors hover:border-primary/40">
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{occ.label}</p>
                        {occ.description && (
                          <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                            {occ.description}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {grp && (
                          <Badge variant="muted" className="hidden sm:inline-flex">
                            {majorGroupLabel(grp, locale as Locale)}
                          </Badge>
                        )}
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              {t("resultsCount", { count: 0 })}
            </li>
          )}
        </ul>

        {/* Pagination */}
        {totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-between">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link
                href={{
                  pathname: "/occupations",
                  query: { q, page: Math.max(1, page - 1) },
                }}
              >
                ← {page - 1 >= 1 ? page - 1 : 1}
              </Link>
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
              <Link
                href={{
                  pathname: "/occupations",
                  query: { q, page: Math.min(totalPages, page + 1) },
                }}
              >
                {page + 1 <= totalPages ? page + 1 : totalPages} →
              </Link>
            </Button>
          </nav>
        )}
      </main>
    </div>
  );
}
