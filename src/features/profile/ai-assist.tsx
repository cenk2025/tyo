"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sparkles, Loader2, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { analyzeFreeTextAction } from "@/lib/ai/actions";
import { addSkills } from "@/lib/db/mutations";
import type { Locale, Skill } from "@/lib/esco/types";
import { cn } from "@/lib/utils";

/**
 * AI-assist panel: paste a free-text description → suggested ESCO skills →
 * confirm which to add (saved with source 'ai_suggested'). Backed by a trigram
 * stub today; the server action is the only swap point for a real LLM.
 */
export function AiAssist() {
  const t = useTranslations("aiAssist");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<Skill[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analyzing, startAnalyze] = useTransition();
  const [adding, startAdd] = useTransition();

  function analyze() {
    startAnalyze(async () => {
      const result = await analyzeFreeTextAction(text, locale);
      setSuggestions(result);
      setSelected(new Set(result.map((s) => s.conceptUri)));
    });
  }

  function toggle(uri: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }

  function addSelected() {
    const chosen = (suggestions ?? []).filter((s) => selected.has(s.conceptUri));
    startAdd(async () => {
      await addSkills(
        chosen.map((s) => ({ skillUri: s.conceptUri, source: "ai_suggested" as const }))
      );
      setSuggestions(null);
      setText("");
      setSelected(new Set());
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("placeholder")}
          rows={4}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button onClick={analyze} disabled={analyzing || text.trim().length < 8}>
          {analyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> {t("analyzing")}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> {t("analyze")}
            </>
          )}
        </Button>

        {suggestions !== null && (
          <div className="space-y-3">
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noSuggestions")}</p>
            ) : (
              <>
                <p className="text-sm font-medium">{t("suggestions")}</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => {
                    const on = selected.has(s.conceptUri);
                    return (
                      <button
                        key={s.conceptUri}
                        type="button"
                        onClick={() => toggle(s.conceptUri)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                          on
                            ? "border-primary bg-primary/10 text-primary"
                            : "hover:bg-accent"
                        )}
                      >
                        {on ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <Button
                  onClick={addSelected}
                  disabled={adding || selected.size === 0}
                  size="sm"
                >
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    `${t("addSelected")} (${selected.size})`
                  )}
                </Button>
              </>
            )}
          </div>
        )}
        <span className="sr-only">{tc("loading")}</span>
      </CardContent>
    </Card>
  );
}
