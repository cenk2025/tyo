"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { languagePlan, postingText, rationaleNote } from "./outputs";
import type { LangfitDraft } from "./types";

/** The three template-rendered outputs. Empty until at least one row is approved. */
export function OutputsPanel({ draft }: { draft: LangfitDraft }) {
  const t = useTranslations("langfit");
  const locale = useLocale() as "fi" | "en";

  if (!draft.tasks.some((x) => x.validated)) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">{t("step3.empty")}</CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="note">
      <TabsList className="flex-wrap">
        <TabsTrigger value="note">{t("step3.note")}</TabsTrigger>
        <TabsTrigger value="posting">{t("step3.posting")}</TabsTrigger>
        <TabsTrigger value="plan">{t("step3.plan")}</TabsTrigger>
      </TabsList>
      <TabsContent value="note">
        <TextOut text={rationaleNote(draft, locale, new Date())} />
      </TabsContent>
      <TabsContent value="posting" className="grid gap-3 md:grid-cols-2">
        <TextOut label="Suomeksi" text={postingText(draft, "fi")} />
        <TextOut label="In English" text={postingText(draft, "en")} />
      </TabsContent>
      <TabsContent value="plan">
        <TextOut text={languagePlan(draft, locale)} />
      </TabsContent>
    </Tabs>
  );
}

function TextOut({ text, label }: { text: string; label?: string }) {
  const t = useTranslations("langfit");
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the text is selectable anyway */
    }
  }
  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          {label ? <span className="text-sm font-medium">{label}</span> : <span />}
          <Button size="sm" variant="ghost" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t("copied") : t("copy")}
          </Button>
        </div>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{text}</pre>
      </CardContent>
    </Card>
  );
}
