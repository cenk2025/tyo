import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserProfile } from "@/lib/db/queries";
import { DashboardShell } from "@/features/dashboard/dashboard-shell";
import { GuestMigrator } from "@/features/auth/guest-migrator";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // proxy already guards this route; this is a defensive fallback.
  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login", locale });

  const profile = user ? await getUserProfile(user.id) : null;
  const userLabel = profile?.display_name || user?.email || "";

  return (
    <DashboardShell userLabel={userLabel}>
      <GuestMigrator />
      {children}
    </DashboardShell>
  );
}
