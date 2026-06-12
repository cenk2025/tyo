import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors");
  const tn = await getTranslations("nav");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">{t("notFound")}</p>
      <Button asChild>
        <Link href="/">{tn("dashboard")}</Link>
      </Button>
    </main>
  );
}
