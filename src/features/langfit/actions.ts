"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isEmbeddingsConfigured } from "@/lib/flags";
import { suggestLangfitTasks } from "@/lib/ai/langfit-tasks";
import { searchSkills } from "@/lib/esco/queries";
import type { Locale } from "@/lib/esco/types";
import { applyRules } from "./rules";
import { escoLabel } from "./outputs";
import { CEFR_LEVELS, LANGUAGES, LANG_SKILLS, RATIONALE_TYPES, REQUIRED_BY, newTaskId } from "./types";
import type { LangSkill, LangTask, Lang } from "./types";

/** AI step. Never throws to the client: `ok: false` means "fall back to manual entry". */
export async function suggestTasksAction(
  adText: string,
  locale: Locale
): Promise<{ ok: true; tasks: LangTask[] } | { ok: false; error: "unavailable" | "failed" | "tooShort" }> {
  if (adText.trim().length < 40) return { ok: false, error: "tooShort" };
  if (!isEmbeddingsConfigured()) return { ok: false, error: "unavailable" };
  try {
    const rows = await suggestLangfitTasks(adText, locale);
    return { ok: true, tasks: rows.map((r) => ({ ...r, id: newTaskId() })) };
  } catch (err) {
    console.error("suggestTasksAction:", err);
    return { ok: false, error: "failed" };
  }
}

const level = z.enum(CEFR_LEVELS).nullable();
const TaskSchema = z.object({
  description: z.string().trim().min(1).max(500),
  language: z.enum(LANGUAGES),
  levels: z.object({ listening: level, reading: level, speaking: level, writing: level }),
  requiredBy: z.enum(REQUIRED_BY),
  rationaleType: z.enum(RATIONALE_TYPES),
  rationale: z.string().max(2000),
  englishSufficient: z.boolean(),
  origin: z.enum(["ai", "example", "human", "rule"]),
  validated: z.boolean(),
  locked: z.boolean(),
  id: z.string(),
});
const SaveSchema = z.object({
  id: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(200),
  adText: z.string().max(20000),
  regulated: z.enum(["health_professional", "public_authority"]).nullable(),
  locale: z.enum(["fi", "en"]),
  tasks: z.array(TaskSchema).max(30),
});

/**
 * Saves only validated rows, after re-applying the rule layer server-side so a
 * tampered client can't unlock a statutory requirement. The DB enforces both
 * again (validated check + lock constraint).
 */
export async function saveAnalysisAction(
  input: z.input<typeof SaveSchema>
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const tasks = applyRules(v.tasks as LangTask[], v.regulated, v.locale).filter((t) => t.validated);
  if (tasks.length === 0) return { ok: false, error: "noValidated" };

  let id = v.id;
  const header = {
    title: v.title,
    ad_text: v.adText,
    regulated_profession: v.regulated,
    locale: v.locale,
    updated_at: new Date().toISOString(),
  };
  if (id) {
    const { error } = await supabase.from("langfit_analyses").update(header).eq("id", id);
    if (error) return { ok: false, error: error.message };
    const { error: delErr } = await supabase.from("langfit_tasks").delete().eq("analysis_id", id);
    if (delErr) return { ok: false, error: delErr.message };
  } else {
    const { data, error } = await supabase
      .from("langfit_analyses")
      .insert({ ...header, user_id: user.id })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
    id = data.id as string;
  }

  const { error: taskErr } = await supabase.from("langfit_tasks").insert(
    tasks.map((t, i) => ({
      analysis_id: id,
      user_id: user.id,
      position: i,
      description: t.description,
      language: t.language,
      level_listening: t.levels.listening,
      level_reading: t.levels.reading,
      level_speaking: t.levels.speaking,
      level_writing: t.levels.writing,
      required_by: t.requiredBy,
      rationale_type: t.rationaleType,
      rationale: t.rationale,
      english_sufficient: t.englishSufficient,
      origin: t.origin,
      validated: true,
      locked: t.locked,
    }))
  );
  if (taskErr) return { ok: false, error: taskErr.message };
  revalidatePath("/[locale]/langfit", "page");
  return { ok: true, id: id! };
}

export async function deleteAnalysisAction(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("langfit_analyses").delete().eq("id", id);
  revalidatePath("/[locale]/langfit", "page");
  return { ok: !error };
}

/**
 * Resolve the ESCO language skill ("interact verbally in Finnish", …) behind
 * each seeker gap, so it can go on the learning list like any other skill.
 * Missing rows (e.g. an unimported label) are simply left out.
 */
export async function languageSkillUrisAction(
  lang: Lang,
  skills: LangSkill[]
): Promise<Partial<Record<LangSkill, string>>> {
  const out: Partial<Record<LangSkill, string>> = {};
  await Promise.all(
    skills
      .filter((s) => LANG_SKILLS.includes(s))
      .map(async (s) => {
        const label = escoLabel(s, lang);
        const hits = await searchSkills(label, "en", 5);
        const exact = hits.find((h) => h.label.toLowerCase() === label.toLowerCase());
        if (exact) out[s] = exact.conceptUri;
      })
  );
  return out;
}
