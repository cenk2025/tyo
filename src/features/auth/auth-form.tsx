"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

type Mode = "login" | "signup";

export function AuthForm({ mode, redirect }: { mode: Mode; redirect?: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = redirect || `/${locale}/${mode === "signup" ? "onboarding" : "dashboard"}`;
  const callback = () =>
    `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(next)}`;

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callback(), shouldCreateUser: mode === "signup" },
    });
    setLoading(false);
    if (error) setError(t("error"));
    else setSent(true);
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fn =
      mode === "signup"
        ? supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: callback() },
          })
        : supabase.auth.signInWithPassword({ email, password });
    const { data, error } = await fn;
    setLoading(false);
    if (error) {
      setError(t("error"));
      return;
    }
    if (data.session) {
      // Guest profile (if any) is migrated by GuestMigrator on the next page.
      router.push(next.replace(`/${locale}`, "") || "/dashboard");
      router.refresh();
    } else {
      setSent(true); // email confirmation required
    }
  }

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback() },
    });
    if (error) {
      setError(t("error"));
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-have" />
        <h2 className="mb-1 font-semibold">{t("checkEmail")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("checkEmailBody", { email })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={usePassword ? handlePassword : handleMagicLink}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {usePassword && (
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : usePassword ? (
            mode === "signup" ? (
              t("signupButton")
            ) : (
              t("loginButton")
            )
          ) : (
            <>
              <Mail className="h-4 w-4" /> {t("magicLink")}
            </>
          )}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => setUsePassword((v) => !v)}
        className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {usePassword ? t("useMagicLink") : t("usePassword")}
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-2 text-muted-foreground">
            {t("orContinueWith")}
          </span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleGoogle}
        disabled={loading}
      >
        {t("google")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "signup" ? t("haveAccount") : t("noAccount")}{" "}
        <Link
          href={mode === "signup" ? "/login" : "/signup"}
          className="font-medium text-primary hover:underline"
        >
          {mode === "signup" ? t("signInInstead") : t("createOne")}
        </Link>
      </p>
      <span className="sr-only">{tc("loading")}</span>
    </div>
  );
}
