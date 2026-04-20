// Adaptive Pressure Engine
// Mantém um snapshot do estado das últimas gerações e produz "ajustes" que
// modulam mutação, exploração e mistura de linhagens da próxima geração.

import { GenerationResult, Scenario, LineageId } from "./lotteryTypes";

export interface PressureSignals {
  lowDiversity: boolean;
  saturatedTerritory: boolean;
  scoreStagnation: boolean;
  lineageDominance: LineageId | null;
  patternRepetition: boolean;
}

export interface AdaptiveAdjustments {
  mutationDelta: number;       // +/- aplicado ao baseMutationRate
  explorationBoost: number;    // 0..1 — força das pressões territoriais
  rigidityDelta: number;       // -1..+1 — afasta/relaxa restrições estruturais
  lineageWeights: Partial<Record<LineageId, number>>; // multiplicadores
  scenarioOverride?: Scenario;
  reasons: string[];
}

const HISTORY_KEY = "aurum.pressure.history";

interface HistoryEntry {
  ts: number;
  avgScore: number;
  avgDiversity: number;
  territoryEntropy: number;
  lineageCounts: Partial<Record<LineageId, number>>;
}

export class PressureEngine {
  private history: HistoryEntry[] = [];

  load() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) this.history = JSON.parse(raw).slice(-20);
    } catch { /* ignore */ }
  }
  persist() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history.slice(-20))); } catch { /* ignore */ }
  }

  observe(result: GenerationResult) {
    const lineageCounts: Partial<Record<LineageId, number>> = {};
    for (const b of result.batches) for (const g of b.games) lineageCounts[g.lineage] = (lineageCounts[g.lineage] ?? 0) + 1;
    this.history.push({
      ts: Date.now(),
      avgScore: result.metrics.avgScore,
      avgDiversity: result.metrics.avgDiversity,
      territoryEntropy: result.metrics.territoryEntropy,
      lineageCounts,
    });
    if (this.history.length > 30) this.history = this.history.slice(-30);
    this.persist();
  }

  signals(): PressureSignals {
    const last = this.history.slice(-5);
    if (last.length < 2) {
      return { lowDiversity: false, saturatedTerritory: false, scoreStagnation: false, lineageDominance: null, patternRepetition: false };
    }
    const avgDiv = last.reduce((s, e) => s + e.avgDiversity, 0) / last.length;
    const avgEnt = last.reduce((s, e) => s + e.territoryEntropy, 0) / last.length;
    const scores = last.map((e) => e.avgScore);
    const scoreVar = variance(scores);

    // dominância de linhagem nos últimos 5
    const totals: Partial<Record<LineageId, number>> = {};
    let totalGames = 0;
    for (const e of last) for (const [k, v] of Object.entries(e.lineageCounts)) {
      totals[k as LineageId] = (totals[k as LineageId] ?? 0) + (v ?? 0);
      totalGames += v ?? 0;
    }
    let dominantLin: LineageId | null = null;
    for (const [lin, n] of Object.entries(totals)) {
      if ((n ?? 0) / Math.max(1, totalGames) > 0.45) { dominantLin = lin as LineageId; break; }
    }

    // repetição de padrão: scores quase idênticos (var muito baixa)
    const patternRepetition = scoreVar < 0.0008 && last.length >= 3;

    return {
      lowDiversity: avgDiv < 0.55,
      saturatedTerritory: avgEnt < 0.92,
      scoreStagnation: scoreVar < 0.001 && last.length >= 3,
      lineageDominance: dominantLin,
      patternRepetition,
    };
  }

  computeAdjustments(scenario: Scenario): AdaptiveAdjustments {
    const sig = this.signals();
    const adj: AdaptiveAdjustments = {
      mutationDelta: 0,
      explorationBoost: 0,
      rigidityDelta: 0,
      lineageWeights: {},
      reasons: [],
    };

    if (sig.lowDiversity) {
      adj.mutationDelta += 0.06;
      adj.explorationBoost += 0.3;
      adj.rigidityDelta -= 0.2;
      adj.reasons.push("Diversidade média baixa nas últimas gerações — aumentando mutação e exploração.");
    }
    if (sig.saturatedTerritory) {
      adj.explorationBoost += 0.4;
      adj.lineageWeights.chaotic = 1.5;
      adj.lineageWeights.dispersive = 1.3;
      adj.reasons.push("Entropia territorial caindo — favorecendo linhagens dispersivas/caóticas.");
    }
    if (sig.scoreStagnation) {
      adj.mutationDelta += 0.05;
      adj.scenarioOverride = scenario === "exploratory" ? "aggressive" : "exploratory";
      adj.reasons.push("Score estagnado — comutando cenário para forçar variação.");
    }
    if (sig.lineageDominance) {
      adj.lineageWeights[sig.lineageDominance] = 0.55;
      adj.reasons.push(`Linhagem ${sig.lineageDominance} dominou — reduzindo peso para reequilibrar.`);
    }
    if (sig.patternRepetition) {
      adj.mutationDelta += 0.07;
      adj.lineageWeights.anticrowd = 1.4;
      adj.reasons.push("Padrão repetitivo detectado — anti-multidão reforçada.");
    }

    return adj;
  }

  reset() {
    this.history = [];
    this.persist();
  }

  snapshot() {
    return this.history.slice();
  }
}

function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

export const globalPressure = new PressureEngine();
