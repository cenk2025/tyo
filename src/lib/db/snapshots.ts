import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/flags";

/**
 * Write a `user_match_snapshots` row for each of the user's target occupations,
 * capturing current essential/optional coverage. Called after ANY mutation to
 * `user_skills` (add, remove, learning completion) so the "progress over time"
 * chart has data points. Coverage is computed in JS from the user's current
 * skill set against each target's required skills.
 *
 * This is the single source of snapshot writes — call `writeMatchSnapshots`
 * rather than inserting snapshots ad hoc.
 */
export async function writeMatchSnapshots(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = await createClient();

    const [{ data: skillRows }, { data: targetRows }] = await Promise.all([
      supabase.from("user_skills").select("skill_uri").eq("user_id", userId),
      supabase
        .from("user_target_occupations")
        .select("occupation_uri")
        .eq("user_id", userId),
    ]);

    const userSkills = new Set((skillRows ?? []).map((r) => r.skill_uri as string));
    const targets = (targetRows ?? []).map((r) => r.occupation_uri as string);
    if (targets.length === 0) return;

    const { data: relations } = await supabase
      .from("occupation_skill_relations")
      .select("occupation_uri, skill_uri, relation_type")
      .in("occupation_uri", targets);

    const rows = targets.map((occUri) => {
      const rels = (relations ?? []).filter((r) => r.occupation_uri === occUri);
      const ess = rels.filter((r) => r.relation_type === "essential");
      const opt = rels.filter((r) => r.relation_type === "optional");
      const essMatched = ess.filter((r) => userSkills.has(r.skill_uri as string)).length;
      const optMatched = opt.filter((r) => userSkills.has(r.skill_uri as string)).length;
      return {
        user_id: userId,
        occupation_uri: occUri,
        essential_coverage: ess.length ? essMatched / ess.length : 0,
        optional_coverage: opt.length ? optMatched / opt.length : 0,
      };
    });

    if (rows.length > 0) {
      await supabase.from("user_match_snapshots").insert(rows);
    }
  } catch {
    // Snapshot writes are best-effort; never block the primary mutation.
  }
}
