import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserProfile } from "@/lib/db/queries";
import { AccountForm } from "@/features/profile/account-form";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account");

  const user = await getCurrentUser();
  const profile = user ? await getUserProfile(user.id) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountForm
            email={user?.email ?? ""}
            displayName={profile?.display_name ?? ""}
            profileLocale={profile?.locale ?? locale}
          />
        </CardContent>
      </Card>
    </div>
  );
}
