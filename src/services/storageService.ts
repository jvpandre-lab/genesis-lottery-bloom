import { supabase } from "@/integrations/supabase/client";
import { Dezena, DrawRecord, GenerationResult } from "@/engine/lotteryTypes";

export async function fetchRecentDraws(limit = 10): Promise<DrawRecord[]> {
  const { data, error } = await supabase
    .from("lotomania_draws")
    .select("contest_number, draw_date, numbers")
    .order("contest_number", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    contestNumber: r.contest_number,
    drawDate: r.draw_date ?? undefined,
    numbers: r.numbers as Dezena[],
  }));
}

export async function countDraws(): Promise<number> {
  const { count, error } = await supabase
    .from("lotomania_draws")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function upsertDraws(draws: DrawRecord[]): Promise<number> {
  if (draws.length === 0) return 0;
  const rows = draws.map((d) => ({
    contest_number: d.contestNumber,
    draw_date: d.drawDate ?? null,
    numbers: d.numbers,
  }));
  const { error, count } = await supabase
    .from("lotomania_draws")
    .upsert(rows, { onConflict: "contest_number", count: "exact" });
  if (error) throw error;
  return count ?? rows.length;
}

export async function persistGeneration(result: GenerationResult): Promise<string> {
  const { data: gen, error: e1 } = await supabase
    .from("generations")
    .insert({
      label: result.label,
      scenario: result.scenario,
      requested_count: result.requestedCount,
      params: {},
      metrics: result.metrics,
    })
    .select("id")
    .single();
  if (e1) throw e1;
  const generationId = gen!.id;

  for (const batch of result.batches) {
    const { data: b, error: e2 } = await supabase
      .from("generation_batches")
      .insert({
        generation_id: generationId,
        name: batch.name,
        purpose: batch.purpose,
        dominant_lineage: batch.dominant,
        score: batch.avgScore,
        metrics: { diversity: batch.diversity, avgScore: batch.avgScore },
      })
      .select("id")
      .single();
    if (e2) throw e2;

    const rows = batch.games.map((g, i) => ({
      batch_id: b!.id,
      numbers: g.numbers,
      lineage: g.lineage,
      score: g.score.total,
      metrics: JSON.parse(JSON.stringify({ score: g.score, gameMetrics: g.metrics })),
      position: i,
    }));
    const { error: e3 } = await supabase.from("generation_games").insert(rows);
    if (e3) throw e3;
  }
  return generationId;
}
