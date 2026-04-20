// Backtest Engine
// Avalia jogos contra concursos reais. Lotomania: 20 dezenas sorteadas;
// jogo = 50 dezenas marcadas. Acerto = quantas sorteadas estão entre as marcadas.
// Premiação histórica: 20 (máx), 19, 18, 17, 16, 15, 0 acertos.

import { Dezena, DrawRecord, Game, GenerationResult, LineageId, BatchName } from "./lotteryTypes";

export interface BacktestBucket {
  windowSize: number;
  draws: number;
  totalGames: number;
  avgHits: number;
  hitsHistogram: Record<number, number>; // 0..20
  freq15plus: number; // fração 0..1
  freq16plus: number;
  freq17plus: number;
  freq18plus: number;
  freq19plus: number;
  freq20: number;
}

export interface BacktestPerLineage {
  lineage: LineageId;
  games: number;
  avgHits: number;
  freq15plus: number;
  freq16plus: number;
}
export interface BacktestPerBatch {
  batch: BatchName;
  games: number;
  avgHits: number;
  freq15plus: number;
}

export interface BacktestReport {
  windows: BacktestBucket[];
  perLineage: BacktestPerLineage[];
  perBatch: BacktestPerBatch[];
  perScenario: { scenario: string; games: number; avgHits: number; freq15plus: number }[];
  generationsAnalyzed: number;
  drawsAvailable: number;
}

export interface GenerationLite {
  id?: string;
  scenario: string;
  batches: { name: BatchName; games: { numbers: Dezena[]; lineage: LineageId }[] }[];
}

export function fromGenerationResult(g: GenerationResult): GenerationLite {
  return {
    id: g.id,
    scenario: g.scenario,
    batches: g.batches.map((b) => ({
      name: b.name,
      games: b.games.map((x) => ({ numbers: x.numbers, lineage: x.lineage })),
    })),
  };
}

export function countHits(gameNumbers: Dezena[], drawNumbers: Dezena[]): number {
  const set = new Set(gameNumbers);
  let n = 0;
  for (const d of drawNumbers) if (set.has(d)) n++;
  return n;
}

export function backtest(generations: GenerationLite[], allDraws: DrawRecord[], windows = [50, 100, 200]): BacktestReport {
  // ordena draws desc por concurso
  const sorted = allDraws.slice().sort((a, b) => b.contestNumber - a.contestNumber);

  const allGames: { numbers: Dezena[]; lineage: LineageId; batch: BatchName; scenario: string }[] = [];
  for (const g of generations) for (const b of g.batches) for (const x of b.games) {
    allGames.push({ numbers: x.numbers, lineage: x.lineage, batch: b.name, scenario: g.scenario });
  }

  const bucketsOut: BacktestBucket[] = [];
  for (const w of windows) {
    const draws = sorted.slice(0, w);
    if (draws.length === 0) continue;
    const histogram: Record<number, number> = {};
    let totalHits = 0, totalGames = 0;
    let f15 = 0, f16 = 0, f17 = 0, f18 = 0, f19 = 0, f20 = 0;
    for (const game of allGames) {
      for (const d of draws) {
        const h = countHits(game.numbers, d.numbers);
        histogram[h] = (histogram[h] ?? 0) + 1;
        totalHits += h;
        totalGames++;
        if (h >= 15) f15++;
        if (h >= 16) f16++;
        if (h >= 17) f17++;
        if (h >= 18) f18++;
        if (h >= 19) f19++;
        if (h === 20) f20++;
      }
    }
    bucketsOut.push({
      windowSize: w,
      draws: draws.length,
      totalGames,
      avgHits: totalGames === 0 ? 0 : totalHits / totalGames,
      hitsHistogram: histogram,
      freq15plus: totalGames === 0 ? 0 : f15 / totalGames,
      freq16plus: totalGames === 0 ? 0 : f16 / totalGames,
      freq17plus: totalGames === 0 ? 0 : f17 / totalGames,
      freq18plus: totalGames === 0 ? 0 : f18 / totalGames,
      freq19plus: totalGames === 0 ? 0 : f19 / totalGames,
      freq20: totalGames === 0 ? 0 : f20 / totalGames,
    });
  }

  // por linhagem (usa janela maior se houver)
  const linMap = new Map<LineageId, { hits: number; games: number; f15: number; f16: number }>();
  const batchMap = new Map<BatchName, { hits: number; games: number; f15: number }>();
  const scenMap = new Map<string, { hits: number; games: number; f15: number }>();
  const refDraws = sorted.slice(0, Math.max(50, windows[0] ?? 50));
  for (const game of allGames) {
    for (const d of refDraws) {
      const h = countHits(game.numbers, d.numbers);
      const lin = linMap.get(game.lineage) ?? { hits: 0, games: 0, f15: 0, f16: 0 };
      lin.hits += h; lin.games++; if (h >= 15) lin.f15++; if (h >= 16) lin.f16++;
      linMap.set(game.lineage, lin);

      const bat = batchMap.get(game.batch) ?? { hits: 0, games: 0, f15: 0 };
      bat.hits += h; bat.games++; if (h >= 15) bat.f15++;
      batchMap.set(game.batch, bat);

      const sc = scenMap.get(game.scenario) ?? { hits: 0, games: 0, f15: 0 };
      sc.hits += h; sc.games++; if (h >= 15) sc.f15++;
      scenMap.set(game.scenario, sc);
    }
  }

  return {
    windows: bucketsOut,
    perLineage: Array.from(linMap.entries()).map(([lineage, v]) => ({
      lineage, games: v.games, avgHits: v.games ? v.hits / v.games : 0,
      freq15plus: v.games ? v.f15 / v.games : 0, freq16plus: v.games ? v.f16 / v.games : 0,
    })).sort((a, b) => b.avgHits - a.avgHits),
    perBatch: Array.from(batchMap.entries()).map(([batch, v]) => ({
      batch, games: v.games, avgHits: v.games ? v.hits / v.games : 0,
      freq15plus: v.games ? v.f15 / v.games : 0,
    })).sort((a, b) => b.avgHits - a.avgHits),
    perScenario: Array.from(scenMap.entries()).map(([scenario, v]) => ({
      scenario, games: v.games, avgHits: v.games ? v.hits / v.games : 0,
      freq15plus: v.games ? v.f15 / v.games : 0,
    })).sort((a, b) => b.avgHits - a.avgHits),
    generationsAnalyzed: generations.length,
    drawsAvailable: sorted.length,
  };
}
