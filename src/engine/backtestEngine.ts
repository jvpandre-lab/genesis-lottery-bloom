// Backtest Engine
// Avalia jogos contra concursos reais. Lotomania: 20 dezenas sorteadas;
// jogo = 50 dezenas marcadas. Acerto = quantas sorteadas estão entre as marcadas.
// Premiação histórica: 20 (máx), 19, 18, 17, 16, 15, 0 acertos.

import { Dezena, DrawRecord, Game, GenerationResult, LineageId, BatchName } from "./lotteryTypes";
import { mulberry32 } from "./rng";

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

export interface EvolutionaryBacktestReport {
  generations: {
    generationIndex: number;
    drawsUsed: number;
    avgHits: number;
    freq15plus: number;
    freq16plus: number;
    freq17plus: number;
    freq18plus: number;
    freq19plus: number;
    freq20: number;
    stabilityScore: number; // variance of hits
    territorySaturation: number; // entropy or something
    convergenceExcess: number; // measure of over-convergence
  }[];
  overall: {
    avgHits: number;
    freq15plus: number;
    freq16plus: number;
    freq17plus: number;
    freq18plus: number;
    freq19plus: number;
    freq20: number;
    stabilityTrend: number; // slope of stability
    saturationTrend: number;
    convergenceTrend: number;
  };
  perLineage: BacktestPerLineage[];
  perBatch: BacktestPerBatch[];
  perScenario: { scenario: string; games: number; avgHits: number; freq15plus: number }[];
}

export async function backtestEvolutionaryRetrospective(
  numGenerations: number,
  baseSeed: number,
  allDraws: DrawRecord[],
  scenario: string,
  generateFunc: (input: any) => Promise<GenerationResult>
): Promise<EvolutionaryBacktestReport> {
  const sortedDraws = allDraws.slice().sort((a, b) => a.contestNumber - b.contestNumber);
  const totalDraws = sortedDraws.length;
  if (totalDraws < numGenerations * 2) throw new Error("Not enough draws for retrospective backtest");

  const generations: GenerationResult[] = [];
  const genReports: EvolutionaryBacktestReport['generations'] = [];

  for (let i = 0; i < numGenerations; i++) {
    const drawsUpTo = Math.floor((i + 1) * totalDraws / numGenerations);
    const availableDraws = sortedDraws.slice(0, drawsUpTo);

    // Generate with deterministic seed
    const seed = baseSeed + i;
    const rng = mulberry32(seed);

    const result = await generateFunc({
      count: 50, // or whatever default
      scenario,
      recentDraws: availableDraws,
      rng,
      twoBrains: true,
      label: `Retro Gen ${i + 1}`,
    });

    generations.push(result);

    // Evaluate against future draws
    const evalDraws = sortedDraws.slice(drawsUpTo, drawsUpTo + 100); // next 100 or available
    if (evalDraws.length === 0) continue;

    const allGames = result.batches.flatMap(b => b.games);
    let totalHits = 0, totalGames = 0;
    let f15 = 0, f16 = 0, f17 = 0, f18 = 0, f19 = 0, f20 = 0;
    const hitsList: number[] = [];

    for (const game of allGames) {
      for (const d of evalDraws) {
        const h = countHits(game.numbers, d.numbers);
        totalHits += h;
        totalGames++;
        hitsList.push(h);
        if (h >= 15) f15++;
        if (h >= 16) f16++;
        if (h >= 17) f17++;
        if (h >= 18) f18++;
        if (h >= 19) f19++;
        if (h === 20) f20++;
      }
    }

    const avgHits = totalGames ? totalHits / totalGames : 0;
    const freq15plus = totalGames ? f15 / totalGames : 0;
    const freq16plus = totalGames ? f16 / totalGames : 0;
    const freq17plus = totalGames ? f17 / totalGames : 0;
    const freq18plus = totalGames ? f18 / totalGames : 0;
    const freq19plus = totalGames ? f19 / totalGames : 0;
    const freq20 = totalGames ? f20 / totalGames : 0;

    const stabilityScore = variance(hitsList);
    // Territory saturation: simple entropy of game territories
    const territories = allGames.map(g => g.numbers);
    const territorySaturation = calculateTerritoryEntropy(territories);
    // Convergence excess: measure how similar games are
    const convergenceExcess = calculateConvergenceExcess(territories);

    genReports.push({
      generationIndex: i + 1,
      drawsUsed: availableDraws.length,
      avgHits,
      freq15plus,
      freq16plus,
      freq17plus,
      freq18plus,
      freq19plus,
      freq20,
      stabilityScore,
      territorySaturation,
      convergenceExcess,
    });
  }

  // Overall metrics
  const avgHits = genReports.reduce((s, g) => s + g.avgHits, 0) / genReports.length;
  const freq15plus = genReports.reduce((s, g) => s + g.freq15plus, 0) / genReports.length;
  const freq16plus = genReports.reduce((s, g) => s + g.freq16plus, 0) / genReports.length;
  const freq17plus = genReports.reduce((s, g) => s + g.freq17plus, 0) / genReports.length;
  const freq18plus = genReports.reduce((s, g) => s + g.freq18plus, 0) / genReports.length;
  const freq19plus = genReports.reduce((s, g) => s + g.freq19plus, 0) / genReports.length;
  const freq20 = genReports.reduce((s, g) => s + g.freq20, 0) / genReports.length;

  const stabilityTrend = linearTrend(genReports.map(g => g.stabilityScore));
  const saturationTrend = linearTrend(genReports.map(g => g.territorySaturation));
  const convergenceTrend = linearTrend(genReports.map(g => g.convergenceExcess));

  // Per lineage, batch, scenario from all generations
  const liteGens = generations.map(g => fromGenerationResult(g));
  const backtestReport = backtest(liteGens, sortedDraws, [50, 100, 200]);

  return {
    generations: genReports,
    overall: {
      avgHits,
      freq15plus,
      freq16plus,
      freq17plus,
      freq18plus,
      freq19plus,
      freq20,
      stabilityTrend,
      saturationTrend,
      convergenceTrend,
    },
    perLineage: backtestReport.perLineage,
    perBatch: backtestReport.perBatch,
    perScenario: backtestReport.perScenario,
  };
}

function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

function calculateTerritoryEntropy(territories: number[][]): number {
  const freq: Record<number, number> = {};
  for (const t of territories) for (const n of t) freq[n] = (freq[n] || 0) + 1;
  const total = territories.length * 50;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy / Math.log2(100); // normalized
}

function calculateConvergenceExcess(territories: number[][]): number {
  if (territories.length < 2) return 0;
  let totalSimilarity = 0;
  for (let i = 0; i < territories.length; i++) {
    for (let j = i + 1; j < territories.length; j++) {
      const sim = jaccardSimilarity(new Set(territories[i]), new Set(territories[j]));
      totalSimilarity += sim;
    }
  }
  const pairs = territories.length * (territories.length - 1) / 2;
  return totalSimilarity / pairs;
}

function jaccardSimilarity(a: Set<number>, b: Set<number>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

function linearTrend(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX = x.reduce((s, v) => s + v, 0);
  const sumY = values.reduce((s, v) => s + v, 0);
  const sumXY = x.reduce((s, v, i) => s + v * values[i], 0);
  const sumXX = x.reduce((s, v) => s + v * v, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  return slope;
}
