"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { OccupationSearch } from "@/features/explore/occupation-search";

type Picked = { code: string; label: string } | null;

/** Pick the role being hired into and (optionally) the new hire's previous occupation. */
export function RolePicker({ initialTo, initialFrom }: { initialTo: Picked; initialFrom: Picked }) {
  const t = useTranslations("onboardPath.picker");
  const router = useRouter();
  const [to, setTo] = useState<Picked>(initialTo);
  const [from, setFrom] = useState<Picked>(initialFrom);

  function go() {
    if (!to) return;
    const q = new URLSearchParams({ to: to.code });
    if (from) q.set("from", from.code);
    router.push(`/perehdytys?${q.toString()}`);
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Slot label={t("toLabel")} hint={t("toHint")} picked={to} onPick={setTo} />
      <Slot label={t("fromLabel")} hint={t("fromHint")} picked={from} onPick={setFrom} />
      <div className="md:col-span-2">
        <Button onClick={go} disabled={!to}>
          {t("build")} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Slot({
  label,
  hint,
  picked,
  onPick,
}: {
  label: string;
  hint: string;
  picked: Picked;
  onPick: (p: Picked) => void;
}) {
  const t = useTranslations("onboardPath.picker");
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {picked ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{picked.label}</span>
          <Button variant="ghost" size="icon" onClick={() => onPick(null)} aria-label={t("clear")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <OccupationSearch onSelect={(o) => onPick({ code: o.code, label: o.label })} placeholder={t("search")} />
      )}
    </div>
  );
}
