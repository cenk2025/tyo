"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { updateProfile } from "@/lib/db/mutations";
import { deleteAccount } from "./account-actions";

export function AccountForm({
  email,
  displayName,
  profileLocale,
}: {
  email: string;
  displayName: string;
  profileLocale: string;
}) {
  const t = useTranslations("account");
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(displayName);
  const [prefLocale, setPrefLocale] = useState(profileLocale);
  const [newEmail, setNewEmail] = useState(email);
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  function save() {
    startSave(async () => {
      await updateProfile({ displayName: name, locale: prefLocale });
      if (newEmail && newEmail !== email) {
        await supabase.auth.updateUser({ email: newEmail });
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    });
  }

  function remove() {
    startDelete(async () => {
      const res = await deleteAccount();
      if (res?.ok) {
        router.push("/");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("displayName")}</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="locale">{t("preferredLanguage")}</Label>
          <select
            id="locale"
            value={prefLocale}
            onChange={(e) => setPrefLocale(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {routing.locales.map((l) => (
              <option key={l} value={l}>
                {l === "fi" ? "Suomi" : "English"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("saveChanges")}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-have">
              <CheckCircle2 className="h-4 w-4" /> {t("saved")}
            </span>
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <h2 className="font-semibold text-destructive">{t("dangerZone")}</h2>
        <p className="text-sm text-muted-foreground">{t("deleteWarning")}</p>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">{t("deleteConfirm")}</Label>
          <Input
            id="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("deleteConfirmWord")}
            className="max-w-xs"
          />
        </div>
        <Button
          variant="destructive"
          disabled={isDeleting || confirm !== t("deleteConfirmWord")}
          onClick={remove}
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("deleteButton")
          )}
        </Button>
      </div>
    </div>
  );
}
