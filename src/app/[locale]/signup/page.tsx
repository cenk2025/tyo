import { setRequestLocale, getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AuthForm } from "@/features/auth/auth-form";

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { locale } = await params;
  const { redirect } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const tApp = await getTranslations("app");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <Sparkles className="h-6 w-6 text-primary" />
        {tApp("name")}
      </Link>
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{t("signupTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("signupSubtitle")}</p>
        </div>
        <AuthForm mode="signup" redirect={redirect} />
      </div>
    </main>
  );
}
