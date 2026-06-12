"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToLearningList } from "@/lib/db/mutations";

/** "Add to learning list" toggle shown on each missing skill. */
export function AddLearningButton({
  skillUri,
  inList,
}: {
  skillUri: string;
  inList: boolean;
}) {
  const t = useTranslations("occupation");
  const [added, setAdded] = useState(inList);
  const [isPending, startTransition] = useTransition();

  function add() {
    if (added) return;
    setAdded(true);
    startTransition(() => {
      void addToLearningList(skillUri);
    });
  }

  return (
    <Button
      variant={added ? "secondary" : "outline"}
      size="sm"
      disabled={added || isPending}
      onClick={add}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : added ? (
        <>
          <Check className="h-3.5 w-3.5" /> {t("inLearning")}
        </>
      ) : (
        <>
          <Plus className="h-3.5 w-3.5" /> {t("addToLearning")}
        </>
      )}
    </Button>
  );
}
