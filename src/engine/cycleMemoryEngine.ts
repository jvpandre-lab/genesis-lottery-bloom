// Cycle Memory Engine
// Armazena e interpreta comportamento em blocos (ciclos), não eventos isolados.
// Ciclos: últimas 5/20 gerações, último ciclo desde mudança de cenário, etc.

import { GenerationResult, Scenario } from "./lotteryTypes";

export interface CycleMetrics {
  diversity: number;
  saturation: number;
  dominance: Record<string, number>; // lineage dominance
  repetition: number;
  drift: number;
  stagnation: number;
  contradiction: number;
  brainBalance: number;
}

export interface CycleHealth {
  healthScore: number; // 0-1
  fatigueLevel: number;
  instability: number;
  recoveryNeed: boolean;
}

export class CycleMemoryEngine {
  private cycles: Map<string, CycleMetrics[]> = new Map();
  private scenarioChanges: number[] = [];

  observeGeneration(result: GenerationResult, scenario: Scenario) {
    this.updateCycle('last5', result, 5);
    this.updateCycle('last20', result, 20);
    this.updateCycle(`sinceScenarioChange_${this.scenarioChanges.length}`, result, Infinity);
  }

  recordScenarioChange() {
    this.scenarioChanges.push(Date.now());
  }

  getCycleHealth(cycleKey: string): CycleHealth {
    const metrics = this.cycles.get(cycleKey) || [];
    if (metrics.length < 2) return { healthScore: 0.5, fatigueLevel: 0, instability: 0, recoveryNeed: false };

    const recent = metrics.slice(-3);
    const avgDiversity = recent.reduce((s, m) => s + m.diversity, 0) / recent.length;
    const avgSaturation = recent.reduce((s, m) => s + m.saturation, 0) / recent.length;
    const avgStagnation = recent.reduce((s, m) => s + m.stagnation, 0) / recent.length;
    const instability = variance(recent.map(m => m.diversity)) + variance(recent.map(m => m.saturation));

    const healthScore = (avgDiversity + (1 - avgSaturation) + (1 - avgStagnation)) / 3;
    const fatigueLevel = avgStagnation > 0.7 ? 1 : avgStagnation / 0.7;
    const recoveryNeed = healthScore < 0.4 || instability > 0.5;

    return {
      healthScore,
      fatigueLevel,
      instability,
      recoveryNeed
    };
  }

  getCycleMetrics(cycleKey: string): CycleMetrics | null {
    const metrics = this.cycles.get(cycleKey);
    return metrics ? metrics[metrics.length - 1] : null;
  }

  private updateCycle(cycleKey: string, result: GenerationResult, maxLength: number) {
    if (!this.cycles.has(cycleKey)) this.cycles.set(cycleKey, []);
    const list = this.cycles.get(cycleKey)!;

    const metrics = this.computeMetrics(result);
    list.push(metrics);
    if (maxLength !== Infinity && list.length > maxLength) list.splice(0, list.length - maxLength);
  }

  private computeMetrics(result: GenerationResult): CycleMetrics {
    const games = result.batches.flatMap(b => b.games);
    const diversity = result.metrics.avgDiversity;
    const saturation = 1 - result.metrics.territoryEntropy; // higher entropy = less saturation

    const dominance: Record<string, number> = {};
    for (const g of games) {
      dominance[g.lineage] = (dominance[g.lineage] || 0) + 1;
    }
    const total = games.length;
    for (const k in dominance) dominance[k] /= total;

    // Repetition: similarity between games
    let repetition = 0;
    for (let i = 0; i < games.length; i++) {
      for (let j = i + 1; j < games.length; j++) {
        repetition += jaccardSimilarity(new Set(games[i].numbers), new Set(games[j].numbers));
      }
    }
    repetition /= (games.length * (games.length - 1)) / 2;

    // Drift: change from previous
    const prev = this.cycles.get('last5')?.slice(-1)[0];
    const drift = prev ? Math.abs(diversity - prev.diversity) + Math.abs(saturation - prev.saturation) : 0;

    // Stagnation: low variance in scores
    const scores = games.map(g => g.score.total);
    const stagnation = variance(scores) < 0.01 ? 1 : 0;

    // Contradiction: high variance in scores
    const contradiction = variance(scores) > 0.5 ? 1 : 0;

    // Brain balance: assume from metrics
    const brainBalance = result.metrics.avgDiversity; // placeholder

    return {
      diversity,
      saturation,
      dominance,
      repetition,
      drift,
      stagnation,
      contradiction,
      brainBalance
    };
  }
}

function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

function jaccardSimilarity(a: Set<number>, b: Set<number>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

export const cycleMemoryEngine = new CycleMemoryEngine();