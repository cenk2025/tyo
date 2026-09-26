import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/flags";
import type { LangTask, LangfitDraft, RegulatedKey, SavedAnalysisSummary } from "./types";

/** Reads of the LangFit tables. RLS scopes every query to the signed-in employer. */

export async function listAnalyses(): Promise<SavedAnalysisSummary[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("langfit_analyses")
      .select("id, title, updated_at, langfit_tasks(count)")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string,
      title: r.title as string,
      updatedAt: r.updated_at as string,
      taskCount: ((r.langfit_tasks as { count: number }[] | null)?.[0]?.count ?? 0) as number,
    }));
  } catch {
    return [];
  }
}

export async function getAnalysis(id: string): Promise<(LangfitDraft & { id: string }) | null> {
  if (!isSupabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("langfit_analyses")
      .select("id, title, ad_text, regulated_profession, langfit_tasks(*)")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const rows = ((data.langfit_tasks ?? []) as Record<string, unknown>[]).sort(
      (a, b) => Number(a.position) - Number(b.position)
    );
    return {
      id: data.id as string,
      title: data.title as string,
      adText: data.ad_text as string,
      regulated: (data.regulated_profession as RegulatedKey | null) ?? null,
      tasks: rows.map(
        (r): LangTask => ({
          id: String(r.id),
          description: r.description as string,
          language: r.language as LangTask["language"],
          levels: {
            listening: (r.level_listening as LangTask["levels"]["listening"]) ?? null,
            reading: (r.level_reading as LangTask["levels"]["reading"]) ?? null,
            speaking: (r.level_speaking as LangTask["levels"]["speaking"]) ?? null,
            writing: (r.level_writing as LangTask["levels"]["writing"]) ?? null,
          },
          requiredBy: r.required_by as LangTask["requiredBy"],
          rationaleType: r.rationale_type as LangTask["rationaleType"],
          rationale: (r.rationale as string) ?? "",
          englishSufficient: Boolean(r.english_sufficient),
          origin: r.origin as LangTask["origin"],
          validated: true,
          locked: Boolean(r.locked),
        })
      ),
    };
  } catch {
    return null;
  }
}
