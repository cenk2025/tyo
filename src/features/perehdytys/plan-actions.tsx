"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copy the plan text, or print the page. */
export function PlanActions({ text }: { text: string }) {
  const t = useTranslations("onboardPath");
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the text below is selectable */
    }
  }
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? t("copied") : t("copy")}
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> {t("print")}
      </Button>
    </div>
  );
}
