import { BATCHES, Batch, BatchName, Dezena, DrawRecord, Game, GenerationResult, LINEAGES, LineageId, Scenario } from "./lotteryTypes";
import { TerritoryMap } from "./territoryEngine";
import { computeMetrics } from "./coverageEngine";
import { batchDiversity, isRedundant } from "./diversityEngine";
import { scoreGame, ScoreContext } from "./scoreEngine";
import { evolve } from "./evolutionaryEngine";
import { defaultRNG, RNG } from "./rng";
import { proposeFromBrain, arbitrateBatch, proposalToGame } from "./twoBrainsEngine";
import { globalPressure, AdaptiveAdjustments } from "./adaptivePressureEngine";

export interface GenerateInput {
  count: number;
  scenario?: Scenario;
  recentDraws?: DrawRecord[];
  rng?: RNG;
  label?: string;
  /** Quando true, usa Dois Cérebros + Árbitro (recomendado). */
  twoBrains?: boolean;
  /** Flags para desativar engines específicos durante testes */
  disableEngines?: {
    territory?: boolean;
    coverage?: boolean;
    diversity?: boolean;
    antiBias?: boolean;
    evolutionary?: boolean;
    adaptivePressure?: boolean;
  };
}

export interface GenerationDiagnostics {
  contradictionsRejected: number;
  arbiterReasoning: string[];
  adjustments: AdaptiveAdjustments;
}

const BATCH_ORDER: BatchName[] = ["Alpha", "Sigma", "Delta", "Omega"];

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
  if (count <= 4) {
    for (let i = 0; i < count; i++) dist[BATCH_ORDER[i]]++;
    return dist;
  }
  let assigned = 0;
  BATCH_ORDER.forEach((b, i) => {
    const n = Math.max(1, Math.round(count * p[i]));
    dist[b] = n; assigned += n;
  });
  while (assigned > count) {
    const heaviest = (Object.entries(dist) as [BatchName, number][]).sort((a, b) => b[1] - a[1])[0][0];
    if (dist[heaviest] > 1) { dist[heaviest]--; assigned--; } else break;
  }
  while (assigned < count) {
    const lightest = (Object.entries(dist) as [BatchName, number][]).sort((a, b) => a[1] - b[1])[0][0];
    dist[lightest]++; assigned++;
  }
  return dist;
}

/** Equilíbrio A/B desejado por lote (fração de Brain A). */
function targetBalanceA(name: BatchName, scenario: Scenario): number {
  const base: Record<BatchName, number> = { Alpha: 0.8, Sigma: 0.45, Delta: 0.3, Omega: 0.2 };
  const shift: Record<Scenario, number> = { conservative: 0.1, hybrid: 0, aggressive: -0.1, exploratory: -0.2 };
  return Math.max(0, Math.min(1, base[name] + shift[scenario]));
}

/** Aplica ajustes adaptativos ao baseMutationRate por cenário. */
function adjustedMutationRate(scenario: Scenario, adj: AdaptiveAdjustments): number {
  const base = scenario === "exploratory" ? 0.14 : scenario === "aggressive" ? 0.11 : scenario === "conservative" ? 0.06 : 0.08;
  return Math.max(0.04, Math.min(0.45, base + adj.mutationDelta));
}

function pickFallbackLineage(batchName: BatchName, slotIdx: number): LineageId {
  const meta = BATCHES[batchName];
  if (slotIdx === 0) return meta.dominant;
  return meta.mix[slotIdx % meta.mix.length];
}

export async function generate(input: GenerateInput): Promise<GenerationResult & { diagnostics: GenerationDiagnostics }> {
  const rng = input.rng ?? defaultRNG;
  const scenario: Scenario = input.scenario ?? "hybrid";
  const totalCount = input.count;
  const recent = (input.recentDraws ?? []).slice(0, 8).map((d) => d.numbers);
  const useTwoBrains = input.twoBrains !== false;
  const disableEngines = input.disableEngines ?? {};

  // Pressão adaptativa
  globalPressure.load();
  const adjustments = disableEngines.adaptivePressure ? { mutationDelta: 0, scenarioOverride: undefined } : globalPressure.computeAdjustments(scenario);
  const effectiveScenario = adjustments.scenarioOverride ?? scenario;

  const territory = new TerritoryMap();
  if (!disableEngines.territory) {
    recent.forEach((nums) => territory.observeNumbers(nums as Dezena[]));
  }

  const distribution = distributeBatches(totalCount, effectiveScenario);
  const batches: Batch[] = [];
  let contradictionsRejected = 0;
  const arbiterReasoning: string[] = [];

  const baseRate = adjustedMutationRate(effectiveScenario, adjustments);

  for (const batchName of BATCH_ORDER) {
    const n = distribution[batchName];
    if (n <= 0) continue;
    const meta = BATCHES[batchName];
    const games: Game[] = [];

    if (useTwoBrains) {
      // Cada cérebro propõe ~ceil(n*1.6) candidatos para o árbitro escolher n.
      const k = Math.max(2, Math.ceil(n * 1.4));
      const ctxBase: Omit<ScoreContext, "lineage"> = {
        usage: disableEngines.territory ? new Array(100).fill(0) : territory.usageSnapshot(),
        reference: [],
        recentDraws: recent as Dezena[][],
      };
      const propsA = proposeFromBrain("A", batchName, 0, ctxBase, k, rng);
      const propsB = proposeFromBrain("B", batchName, 0, ctxBase, k, rng);
      const balanceA = targetBalanceA(batchName, effectiveScenario);
      const { selected, reasoning } = arbitrateBatch([...propsA, ...propsB], n, balanceA, ctxBase);
      arbiterReasoning.push(`Lote ${batchName}: ${reasoning.join(" | ")}`);

      // Contradição: rejeita redundantes do conjunto selecionado
      const finalGames: Game[] = [];
      for (const p of selected) {
        const cand = proposalToGame(p, { ...ctxBase, reference: finalGames.map((g) => g.numbers) });
        if (isRedundant(cand.numbers, finalGames.map((g) => g.numbers), 0.78)) {
          contradictionsRejected++;
          // tenta um substituto: re-evolve com mutação alta
          const retry = disableEngines.evolutionary ? Array.from({ length: 50 }, (_, i) => (i * 3 + p.lineage.charCodeAt(0)) % 100) : evolve(p.lineage, { ...ctxBase, lineage: p.lineage, reference: finalGames.map((g) => g.numbers) }, {
            populationSize: 28, generations: 14, baseMutationRate: Math.min(0.45, baseRate + 0.15), rng,
          });
          const m = computeMetrics(retry);
          const s = scoreGame(retry, { ...ctxBase, lineage: p.lineage, reference: finalGames.map((g) => g.numbers) }, m);
          finalGames.push({ numbers: retry, lineage: p.lineage, score: s, metrics: m });
        } else {
          // recompute score considerando refs atualizadas
          const m = computeMetrics(cand.numbers);
          const s = scoreGame(cand.numbers, { ...ctxBase, lineage: p.lineage, reference: finalGames.map((g) => g.numbers) }, m);
          finalGames.push({ ...cand, score: s, metrics: m });
        }
        if (!disableEngines.territory) {
          territory.observeNumbers(finalGames[finalGames.length - 1].numbers);
        }
      }
      games.push(...finalGames);
    } else {
      // Caminho sem dois cérebros (mantido para fallback/testes)
      let attempts = 0;
      while (games.length < n && attempts < n * 6) {
        attempts++;
        const lineage = pickFallbackLineage(batchName, games.length);
        const ctx: ScoreContext = {
          usage: disableEngines.territory ? new Array(100).fill(0) : territory.usageSnapshot(),
          reference: games.map((g) => g.numbers),
          recentDraws: recent as Dezena[][],
          lineage,
        };
        const numbers = disableEngines.evolutionary ? Array.from({ length: 50 }, (_, i) => (i * 2 + lineage.charCodeAt(0)) % 100) : evolve(lineage, ctx, { populationSize: 32, generations: 18, baseMutationRate: baseRate, rng });
        if (!disableEngines.diversity && isRedundant(numbers, games.map((g) => g.numbers), 0.8)) { contradictionsRejected++; continue; }
        const metrics = disableEngines.coverage ? { coverage: 0.5, balance: 0.5, distribution: 0.5 } : computeMetrics(numbers);
        const score = scoreGame(numbers, ctx, metrics);
        if (games.length > 0 && score.total < 0.45) { contradictionsRejected++; continue; }
        games.push({ numbers, lineage, score, metrics });
        if (!disableEngines.territory) {
          territory.observeNumbers(numbers);
        }
      }
      while (games.length < n) {
        const lineage = pickFallbackLineage(batchName, games.length);
        const ctx: ScoreContext = {
          usage: disableEngines.territory ? new Array(100).fill(0) : territory.usageSnapshot(),
          reference: games.map((g) => g.numbers),
          recentDraws: recent as Dezena[][],
          lineage
        };
        const numbers = disableEngines.evolutionary ? Array.from({ length: 50 }, (_, i) => i * 2 % 100) : evolve(lineage, ctx, { populationSize: 24, generations: 12, baseMutationRate: Math.min(0.4, baseRate + 0.08), rng });
        const metrics = disableEngines.coverage ? { coverage: 0.5, balance: 0.5, distribution: 0.5 } : computeMetrics(numbers);
        const score = scoreGame(numbers, ctx, metrics);
        games.push({ numbers, lineage, score, metrics });
        if (!disableEngines.territory) {
          territory.observeNumbers(numbers);
        }
      }
    }

    const avgScore = games.reduce((s, g) => s + g.score.total, 0) / games.length;
    const diversity = batchDiversity(games);
    batches.push({ name: batchName, purpose: meta.purpose, dominant: meta.dominant, games, avgScore, diversity });
  }

  const allGames = batches.flatMap((b) => b.games);
  const avgScore = allGames.reduce((s, g) => s + g.score.total, 0) / Math.max(1, allGames.length);
  const avgDiversity = batches.reduce((s, b) => s + b.diversity, 0) / Math.max(1, batches.length);
  const avgCoverage = allGames.reduce((s, g) => s + g.score.coverage, 0) / Math.max(1, allGames.length);
  const territoryEntropy = disableEngines.territory ? 0 : territory.entropy();

  const result: GenerationResult = {
    label: input.label ?? `Geração ${new Date().toLocaleTimeString("pt-BR")}`,
    scenario: effectiveScenario,
    requestedCount: totalCount,
    batches,
    metrics: { avgScore, avgDiversity, avgCoverage, territoryEntropy },
    createdAt: new Date().toISOString(),
  };

  if (!disableEngines.adaptivePressure) {
    globalPressure.observe(result);
  }

  return { ...result, diagnostics: { contradictionsRejected, arbiterReasoning, adjustments } };
}
