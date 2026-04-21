import { BATCHES, Batch, BatchName, Dezena, DrawRecord, Game, GenerationResult, LINEAGES, LineageId, Scenario } from "./lotteryTypes";
import { TerritoryMap } from "./territoryEngine";
import { computeMetrics, coverageScore, clusterPenalty } from "./coverageEngine";
import { batchDiversity, isRedundant } from "./diversityEngine";
import { scoreGame, ScoreContext } from "./scoreEngine";
import { evolve } from "./evolutionaryEngine";
import { defaultRNG, RNG } from "./rng";
import { proposeFromBrain, arbitrateBatch, proposalToGame, ArbiterMetrics } from "./twoBrainsEngine";
import { globalPressure, AdaptiveAdjustments } from "./adaptivePressureEngine";
import { buildPreGenContext, PreGenContext } from "./preGenEcosystem";
import { tacticalRoleEngine } from "./tacticalRoleEngine";

export interface GenerateInput {
  count: number;
  scenario?: Scenario;
  recentDraws?: DrawRecord[];
  /** Histórico de gerações anteriores para o ecossistema pré-gen. */
  recentResults?: GenerationResult[];
  rng?: RNG;
  label?: string;
  /** Quando true, usa Dois Cérebros + Árbitro (recomendado). */
  twoBrains?: boolean;
  /** Flags para desativar engines específicos (testes A/B). */
  disableEngines?: {
    territory?: boolean;
    coverage?: boolean;
    diversity?: boolean;
    antiBias?: boolean;
    evolutionary?: boolean;
    adaptivePressure?: boolean;
    preGenEcosystem?: boolean;
    batchObjective?: boolean;
  };
}

/** Diagnósticos completos da geração. */
export interface GenerationDiagnostics {
  contradictionsRejected: number;
  arbiterReasoning: string[];
  arbiterMetrics: ArbiterMetrics[];
  adjustments: AdaptiveAdjustments;
  preGenContext: PreGenContext | null;
  batchObjectiveScores: Record<BatchName, number>;
  overallObjectiveScore: number;
  ecoBrainBalance: { picksA: number; picksB: number };
}

const BATCH_ORDER: BatchName[] = ["Alpha", "Sigma", "Delta", "Omega"];

function distributeBatches(count: number, scenario: Scenario): Record<BatchName, number> {
  const dist: Record<BatchName, number> = { Alpha: 0, Sigma: 0, Delta: 0, Omega: 0 };
  if (count <= 0) return dist;
  const profiles: Record<Scenario, [number, number, number, number]> = {
    conservative: [0.55, 0.25, 0.10, 0.10],
    hybrid: [0.30, 0.30, 0.20, 0.20],
    aggressive: [0.15, 0.30, 0.30, 0.25],
    exploratory: [0.10, 0.25, 0.25, 0.40],
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

/**
 * P1 FIX: Shifts por cenário mais agressivos.
 * conservative: Alpha → 0.90 Brain A; Omega → 0.35
 * hybrid: equilíbrio real ~0.50 em todos
 * aggressive/exploratory: Alpha não cai abaixo de 0.30, Omega sobe para 0.65/0.75
 */
function targetBalanceA(name: BatchName, scenario: Scenario, preGenAdj: number = 0): number {
  const base: Record<BatchName, number> = { Alpha: 0.82, Sigma: 0.50, Delta: 0.32, Omega: 0.22 };
  const shift: Record<Scenario, number> = {
    conservative: +0.10,
    hybrid: 0,
    aggressive: -0.14,
    exploratory: -0.22,
  };
  return Math.max(0.10, Math.min(0.92, base[name] + shift[scenario] + preGenAdj));
}

function adjustedMutationRate(scenario: Scenario, adj: AdaptiveAdjustments, preGenMod: number): number {
  const base = scenario === "exploratory" ? 0.14 : scenario === "aggressive" ? 0.11 : scenario === "conservative" ? 0.06 : 0.08;
  return Math.max(0.04, Math.min(0.45, base + adj.mutationDelta + preGenMod));
}

function pickFallbackLineage(batchName: BatchName, slotIdx: number): LineageId {
  const meta = BATCHES[batchName];
  if (slotIdx === 0) return meta.dominant;
  return meta.mix[slotIdx % meta.mix.length];
}

/**
 * P6: Função objetivo do lote — combina 6 dimensões.
 * Substitui seleção baseada apenas em score bruto.
 */
function computeBatchObjective(
  games: Game[],
  picksA: number,
  picksB: number,
  scenario: Scenario,
  batchName: BatchName,
): number {
  if (games.length === 0) return 0;
  const qualityScore = games.reduce((s, g) => s + g.score.total, 0) / games.length;
  const avgCoverage = games.reduce((s, g) => s + g.score.coverage, 0) / games.length;
  const diversity = batchDiversity(games);
  const avgCluster = games.reduce((s, g) => s + g.score.clusterPenalty, 0) / games.length;

  // Equilíbrio Brain A/B vs target
  const totalGames = picksA + picksB;
  const actualBalanceA = totalGames > 0 ? picksA / totalGames : 0.5;
  const desiredBalanceA = targetBalanceA(batchName, scenario);
  const brainBalance = 1 - Math.abs(actualBalanceA - desiredBalanceA) * 2; // penaliza desvio

  // Cobertura territorial simplificada (all numbers, quão espalhadas)
  const allNums = new Set(games.flatMap(g => g.numbers));
  const territorialCoverage = allNums.size / 100;

  return qualityScore * 0.25
    + avgCoverage * 0.20
    + diversity * 0.20
    + avgCluster * 0.10
    + Math.max(0, brainBalance) * 0.15
    + territorialCoverage * 0.10;
}

export async function generate(input: GenerateInput): Promise<GenerationResult & { diagnostics: GenerationDiagnostics }> {
  const rng = input.rng ?? defaultRNG;
  const scenario: Scenario = input.scenario ?? "hybrid";
  const totalCount = input.count;
  const recent = (input.recentDraws ?? []).slice(0, 8).map(d => d.numbers);
  const recentResults = input.recentResults ?? [];
  const useTwoBrains = input.twoBrains !== false;
  const disableEngines = input.disableEngines ?? {};

  // ── Pressão adaptativa ─────────────────────────────────────────────────
  globalPressure.load();
  const adjustments = disableEngines.adaptivePressure
    ? { mutationDelta: 0, explorationBoost: 0, rigidityDelta: 0, lineageWeights: {}, scenarioOverride: undefined, reasons: [] }
    : globalPressure.computeAdjustments(scenario);
  const effectiveScenario: Scenario = adjustments.scenarioOverride ?? scenario;

  // ── P5: Ecossistema pré-geração ────────────────────────────────────────
  let preGenCtx: PreGenContext | null = null;
  if (!disableEngines.preGenEcosystem) {
    preGenCtx = buildPreGenContext(recentResults, input.recentDraws ?? [], effectiveScenario);
    // ScenarioEvolution pode sobrepor cenário
    // (não sobrescreve effectiveScenario aqui para manter traceable, mas informa árbitro)
  }

  const finalScenario: Scenario = (preGenCtx?.scenarioOverride) ?? effectiveScenario;
  const preGenMutMod = preGenCtx?.mutationRateModifier ?? 0;
  const preGenBalAdj = preGenCtx?.targetBalanceAdjustment ?? 0;
  const preGenWeights = preGenCtx?.weightModifiers ?? new Array(100).fill(1);
  const lineagePenalties = preGenCtx?.lineagePenalties ?? {};

  // ── Territory ──────────────────────────────────────────────────────────
  const territory = new TerritoryMap();
  if (!disableEngines.territory) {
    recent.forEach(nums => territory.observeNumbers(nums as Dezena[]));
  }

  // Combinar usageWeights com preGenWeights (produto normalizado)
  function getEffectiveUsage(): number[] {
    const base = disableEngines.territory ? new Array(100).fill(0) : territory.usageSnapshot();
    if (disableEngines.preGenEcosystem) return base;
    return base.map((u, i) => u * (1 / Math.max(0.1, preGenWeights[i]))); // zonas bloqueadas ficam "mais usadas"
  }

  const distribution = distributeBatches(totalCount, finalScenario);
  const batches: Batch[] = [];
  let contradictionsRejected = 0;
  const arbiterReasoning: string[] = [];
  const arbiterMetricsList: ArbiterMetrics[] = [];
  const batchObjectiveScores: Record<BatchName, number> = { Alpha: 0, Sigma: 0, Delta: 0, Omega: 0 };
  let totalPicksA = 0, totalPicksB = 0;

  const baseRate = adjustedMutationRate(finalScenario, adjustments, preGenMutMod);

  for (const batchName of BATCH_ORDER) {
    const n = distribution[batchName];
    if (n <= 0) continue;
    const meta = BATCHES[batchName];
    const games: Game[] = [];
    const effectiveUsage = getEffectiveUsage();

    if (useTwoBrains) {
      const k = Math.max(2, Math.ceil(n * 1.6)); // mais candidatos para árbitro escolher
      const ctxBase: Omit<ScoreContext, "lineage"> & { preGenWeightModifiers?: number[] } = {
        usage: effectiveUsage,
        reference: [],
        recentDraws: recent as Dezena[][],
        // P4 FIX: passa preGenWeightModifiers para o GA via ctx
        preGenWeightModifiers: disableEngines.preGenEcosystem ? undefined : preGenWeights,
      };

      const propsA = proposeFromBrain("A", batchName, 0, ctxBase, k, rng);
      const propsB = proposeFromBrain("B", batchName, 0, ctxBase, k, rng);

      // P5: aplicar penalidades de linhagem ao scoreTotal dos candidatos
      const applyLineagePenalties = (props: typeof propsA) =>
        props.map(p => ({
          ...p,
          scoreTotal: p.scoreTotal * (lineagePenalties[p.lineage] ?? 1.0),
        }));

      const adjustedA = applyLineagePenalties(propsA);
      const adjustedB = applyLineagePenalties(propsB);

      // P1 FIX: targetBalanceA com shift pré-gen do ecossistema
      const balanceA = targetBalanceA(batchName, finalScenario, preGenBalAdj);

      const { selected, reasoning, metrics } = arbitrateBatch(
        [...adjustedA, ...adjustedB],
        n,
        balanceA,
        ctxBase,
        finalScenario,
      );

      arbiterReasoning.push(`Lote ${batchName}: ${reasoning.join(" | ")}`);
      arbiterMetricsList.push(metrics);
      totalPicksA += metrics.picksA;
      totalPicksB += metrics.picksB;

      // Contradição: rejeita redundantes do conjunto selecionado
      const finalGames: Game[] = [];
      for (const p of selected) {
        const updatedRef = finalGames.map(g => g.numbers);
        const cand = proposalToGame(p, { ...ctxBase, reference: updatedRef });
        if (!disableEngines.diversity && isRedundant(cand.numbers, updatedRef, 0.78)) {
          contradictionsRejected++;
          // Substituto com mutação alta e contexto do lote atual
          const retryCtx: ScoreContext = { ...ctxBase, lineage: p.lineage, reference: updatedRef };
          const retry = evolve(p.lineage, retryCtx, {
            populationSize: 28, generations: 14, baseMutationRate: Math.min(0.45, baseRate + 0.15), rng,
          });
          const m = computeMetrics(retry);
          const s = scoreGame(retry, retryCtx, m);
          finalGames.push({ numbers: retry, lineage: p.lineage, score: s, metrics: m });
        } else {
          const updatedRef2 = finalGames.map(g => g.numbers);
          const m = computeMetrics(cand.numbers);
          const s = scoreGame(cand.numbers, { ...ctxBase, lineage: p.lineage, reference: updatedRef2 }, m);
          finalGames.push({ ...cand, score: s, metrics: m });
        }
        if (!disableEngines.territory) {
          territory.observeNumbers(finalGames[finalGames.length - 1].numbers);
        }
      }
      games.push(...finalGames);
    } else {
      // Caminho sem Dois Cérebros (fallback/testes)
      let attempts = 0;
      while (games.length < n && attempts < n * 6) {
        attempts++;
        const lineage = pickFallbackLineage(batchName, games.length);
        const ctx: ScoreContext = {
          usage: effectiveUsage,
          reference: games.map(g => g.numbers),
          recentDraws: recent as Dezena[][],
          lineage,
        };
        const numbers = disableEngines.evolutionary
          ? Array.from({ length: 50 }, (_, i) => (i * 2 + lineage.charCodeAt(0)) % 100)
          : evolve(lineage, ctx, { populationSize: 32, generations: 18, baseMutationRate: baseRate, rng });
        if (!disableEngines.diversity && isRedundant(numbers, games.map(g => g.numbers), 0.80)) {
          contradictionsRejected++; continue;
        }
        const metrics = disableEngines.coverage ? { coverage: 0.5, balance: 0.5, distribution: 0.5, evenCount: 25, oddCount: 25, primeCount: 10, sumTotal: 2475, meanGap: 2, maxGap: 10, consecutivePairs: 5, decadeCounts: new Array(10).fill(5), rowCounts: new Array(10).fill(5), colCounts: new Array(10).fill(5) } : computeMetrics(numbers);
        const score = scoreGame(numbers, ctx, metrics);
        if (games.length > 0 && score.total < 0.45) { contradictionsRejected++; continue; }
        games.push({ numbers, lineage, score, metrics });
        if (!disableEngines.territory) territory.observeNumbers(numbers);
      }
      while (games.length < n) {
        const lineage = pickFallbackLineage(batchName, games.length);
        const ctx: ScoreContext = {
          usage: effectiveUsage,
          reference: games.map(g => g.numbers),
          recentDraws: recent as Dezena[][],
          lineage,
        };
        const numbers = disableEngines.evolutionary
          ? Array.from({ length: 50 }, (_, i) => i * 2 % 100)
          : evolve(lineage, ctx, { populationSize: 24, generations: 12, baseMutationRate: Math.min(0.4, baseRate + 0.08), rng });
        const metrics = computeMetrics(numbers);
        const score = scoreGame(numbers, ctx, metrics);
        games.push({ numbers, lineage, score, metrics });
        if (!disableEngines.territory) territory.observeNumbers(numbers);
      }
    }

    // P6: Calcular batch objective score
    const bPicksA = useTwoBrains ? arbiterMetricsList[arbiterMetricsList.length - 1]?.picksA ?? 0 : 0;
    const bPicksB = useTwoBrains ? arbiterMetricsList[arbiterMetricsList.length - 1]?.picksB ?? 0 : 0;
    const objScore = disableEngines.batchObjective
      ? games.reduce((s, g) => s + g.score.total, 0) / Math.max(1, games.length)
      : computeBatchObjective(games, bPicksA, bPicksB, finalScenario, batchName);
    batchObjectiveScores[batchName] = objScore;

    const avgScore = games.reduce((s, g) => s + g.score.total, 0) / games.length;
    const diversity = batchDiversity(games);
    batches.push({ name: batchName, purpose: meta.purpose, dominant: meta.dominant, games, avgScore, diversity });
  }

  const allGames = batches.flatMap(b => b.games);
  const avgScore = allGames.reduce((s, g) => s + g.score.total, 0) / Math.max(1, allGames.length);
  const avgDiversity = batches.reduce((s, b) => s + b.diversity, 0) / Math.max(1, batches.length);
  const avgCoverage = allGames.reduce((s, g) => s + g.score.coverage, 0) / Math.max(1, allGames.length);
  const territoryEntropy = disableEngines.territory ? 0 : territory.entropy();

  const overallObjectiveScore = Object.values(batchObjectiveScores).reduce((s, v) => s + v, 0) /
    Math.max(1, Object.values(batchObjectiveScores).filter(v => v > 0).length);

  const result: GenerationResult = {
    label: input.label ?? `Geração ${new Date().toLocaleTimeString("pt-BR")}`,
    scenario: finalScenario,
    requestedCount: totalCount,
    batches,
    metrics: { avgScore, avgDiversity, avgCoverage, territoryEntropy },
    createdAt: new Date().toISOString(),
  };

  if (!disableEngines.adaptivePressure) {
    globalPressure.observe(result);
  }

  const diagnostics: GenerationDiagnostics = {
    contradictionsRejected,
    arbiterReasoning,
    arbiterMetrics: arbiterMetricsList,
    adjustments,
    preGenContext: preGenCtx,
    batchObjectiveScores,
    overallObjectiveScore,
    ecoBrainBalance: { picksA: totalPicksA, picksB: totalPicksB },
  };

  return { ...result, diagnostics };
}
