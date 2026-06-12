"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Target, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addTarget, removeTarget } from "@/lib/db/mutations";

/** Toggle an occupation as a target (occupation detail + elsewhere). */
export function SetTargetButton({
  occupationUri,
  isTarget,
}: {
  occupationUri: string;
  isTarget: boolean;
}) {
  const t = useTranslations("occupation");
  const [on, setOn] = useState(isTarget);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(() => {
      void (next ? addTarget(occupationUri) : removeTarget(occupationUri));
    });
  }

  return (
    <Button variant={on ? "secondary" : "default"} onClick={toggle} disabled={isPending}>
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : on ? (
        <>
          <Check className="h-4 w-4" /> {t("targetSet")}
        </>
      ) : (
        <>
          <Target className="h-4 w-4" /> {t("setTarget")}
        </>
      )}
    </Button>
  );
}
