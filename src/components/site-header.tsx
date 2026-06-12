import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";

/** Public top navigation for marketing + explore pages. */
export async function SiteHeader() {
  const t = await getTranslations("nav");
  const tApp = await getTranslations("app");
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-5 w-5 text-primary" />
          <span>{tApp("name")}</span>
        </Link>
        <nav className="ml-6 hidden items-center gap-1 text-sm md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/occupations">{t("explore")}</Link>
          </Button>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
          {user ? (
            <Button asChild size="sm">
              <Link href="/dashboard">{t("dashboard")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{t("login")}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">{t("signup")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
