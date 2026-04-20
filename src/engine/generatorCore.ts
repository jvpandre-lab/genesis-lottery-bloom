import { BATCHES, Batch, BatchName, Dezena, DrawRecord, Game, GenerationResult, LINEAGES, LineageId, Scenario } from "./lotteryTypes";
import { TerritoryMap } from "./territoryEngine";
import { computeMetrics } from "./coverageEngine";
import { batchDiversity, isRedundant } from "./diversityEngine";
import { scoreGame } from "./scoreEngine";
import { evolve } from "./evolutionaryEngine";
import { defaultRNG, RNG } from "./rng";

export interface GenerateInput {
  count: number;            // total de jogos
  scenario?: Scenario;
  recentDraws?: DrawRecord[];
  rng?: RNG;
  label?: string;
}

const BATCH_ORDER: BatchName[] = ["Alpha", "Sigma", "Delta", "Omega"];

/**
 * Distribui o total de jogos entre lotes conforme cenário,
 * sempre garantindo pelo menos 1 lote ativo.
 */
function distributeBatches(count: number, scenario: Scenario): Record<BatchName, number> {
  const dist: Record<BatchName, number> = { Alpha: 0, Sigma: 0, Delta: 0, Omega: 0 };
  if (count <= 0) return dist;
  const profiles: Record<Scenario, [number, number, number, number]> = {
    conservative: [0.55, 0.25, 0.10, 0.10],
    hybrid:       [0.30, 0.30, 0.20, 0.20],
    aggressive:   [0.15, 0.30, 0.30, 0.25],
    exploratory:  [0.10, 0.25, 0.25, 0.40],
  };
  const p = profiles[scenario];
  // se count for pequeno, usa rotação garantida
  if (count <= 4) {
    for (let i = 0; i < count; i++) dist[BATCH_ORDER[i]]++;
    return dist;
  }
  let assigned = 0;
  BATCH_ORDER.forEach((b, i) => {
    const n = Math.max(1, Math.round(count * p[i]));
    dist[b] = n;
    assigned += n;
  });
  // ajuste fino
  while (assigned > count) {
    // remove do lote com mais
    const heaviest = (Object.entries(dist) as [BatchName, number][]).sort((a, b) => b[1] - a[1])[0][0];
    if (dist[heaviest] > 1) { dist[heaviest]--; assigned--; } else break;
  }
  while (assigned < count) {
    const lightest = (Object.entries(dist) as [BatchName, number][]).sort((a, b) => a[1] - b[1])[0][0];
    dist[lightest]++; assigned++;
  }
  return dist;
}

/**
 * Para cada jogo de um lote, escolhe a linhagem com base na composição do lote
 * (mistura definida em BATCHES). O dominante recebe peso maior.
 */
function pickLineageForSlot(batchName: BatchName, slotIdx: number, total: number): LineageId {
  const meta = BATCHES[batchName];
  const mix = meta.mix;
  // intercala dominante / mix
  if (slotIdx === 0) return meta.dominant;
  return mix[slotIdx % mix.length];
}

export async function generate(input: GenerateInput): Promise<GenerationResult> {
  const rng = input.rng ?? defaultRNG;
  const scenario: Scenario = input.scenario ?? "hybrid";
  const totalCount = input.count;
  const recent = (input.recentDraws ?? []).slice(0, 8).map((d) => d.numbers);

  const territory = new TerritoryMap();
  // pré-aquecer território com draws recentes para anti-saturação realista
  recent.forEach((nums) => territory.observeNumbers(nums as Dezena[]));

  const distribution = distributeBatches(totalCount, scenario);
  const batches: Batch[] = [];

  for (const batchName of BATCH_ORDER) {
    const n = distribution[batchName];
    if (n <= 0) continue;
    const meta = BATCHES[batchName];
    const games: Game[] = [];

    let attempts = 0;
    while (games.length < n && attempts < n * 6) {
      attempts++;
      const lineage = pickLineageForSlot(batchName, games.length, n);
      const ctx = {
        usage: territory.usageSnapshot(),
        reference: games.map((g) => g.numbers),
        recentDraws: recent as Dezena[][],
        lineage,
      };
      const numbers = evolve(lineage, ctx, {
        populationSize: 32,
        generations: 18,
        eliteFrac: 0.25,
        baseMutationRate: scenario === "exploratory" ? 0.14 : scenario === "aggressive" ? 0.11 : 0.08,
        rng,
      });

      // Contradição: rejeita se redundante com jogos já aceitos
      if (isRedundant(numbers, games.map((g) => g.numbers), 0.8)) continue;

      const metrics = computeMetrics(numbers);
      const score = scoreGame(numbers, ctx, metrics);

      // contradição forte: jogos com score baixíssimo entram no descarte e tentamos de novo
      if (games.length > 0 && score.total < 0.45) continue;

      games.push({ numbers, lineage, score, metrics });
      territory.observeNumbers(numbers);
    }

    // se ficou faltando jogos por restrição muito dura, completa relaxando
    while (games.length < n) {
      const lineage = pickLineageForSlot(batchName, games.length, n);
      const ctx = { usage: territory.usageSnapshot(), reference: games.map((g) => g.numbers), recentDraws: recent as Dezena[][], lineage };
      const numbers = evolve(lineage, ctx, { populationSize: 24, generations: 12, baseMutationRate: 0.16, rng });
      const metrics = computeMetrics(numbers);
      const score = scoreGame(numbers, ctx, metrics);
      games.push({ numbers, lineage, score, metrics });
      territory.observeNumbers(numbers);
    }

    const avgScore = games.reduce((s, g) => s + g.score.total, 0) / games.length;
    const diversity = batchDiversity(games);
    batches.push({ name: batchName, purpose: meta.purpose, dominant: meta.dominant, games, avgScore, diversity });
  }

  const allGames = batches.flatMap((b) => b.games);
  const avgScore = allGames.reduce((s, g) => s + g.score.total, 0) / Math.max(1, allGames.length);
  const avgDiversity = batches.reduce((s, b) => s + b.diversity, 0) / Math.max(1, batches.length);
  const avgCoverage = allGames.reduce((s, g) => s + g.score.coverage, 0) / Math.max(1, allGames.length);
  const territoryEntropy = territory.entropy();

  return {
    label: input.label ?? `Geração ${new Date().toLocaleTimeString("pt-BR")}`,
    scenario,
    requestedCount: totalCount,
    batches,
    metrics: { avgScore, avgDiversity, avgCoverage, territoryEntropy },
    createdAt: new Date().toISOString(),
  };
}
