import { Dezena, ScoreBreakdown, GameMetrics, LineageId } from "./lotteryTypes";
import { coverageScore, gridCoverageScore, distributionScore, clusterPenalty, territoryScore, computeMetrics } from "./coverageEngine";
import { antiBiasScore, recencyPenalty } from "./antiBiasEngine";
import { diversityVsSet } from "./diversityEngine";

export interface ScoreContext {
  usage: number[];           // territoryUsage snapshot
  reference: Dezena[][];     // outros jogos do lote (para diversidade)
  recentDraws: Dezena[][];   // últimas N draws para anti-recency
  lineage: LineageId;
}

/** Pesos por linhagem — cada linhagem otimiza diferentes dimensões. */
export function weightsFor(lineage: LineageId) {
  switch (lineage) {
    case "conservative": return { coverage: 0.28, distribution: 0.30, diversity: 0.10, territory: 0.07, antiBias: 0.10, cluster: 0.15 };
    case "dispersive":   return { coverage: 0.22, distribution: 0.18, diversity: 0.20, territory: 0.18, antiBias: 0.10, cluster: 0.12 };
    case "coverage":     return { coverage: 0.34, distribution: 0.18, diversity: 0.14, territory: 0.14, antiBias: 0.08, cluster: 0.12 };
    case "anticrowd":    return { coverage: 0.18, distribution: 0.14, diversity: 0.18, territory: 0.10, antiBias: 0.30, cluster: 0.10 };
    case "hybrid":       return { coverage: 0.22, distribution: 0.20, diversity: 0.18, territory: 0.14, antiBias: 0.16, cluster: 0.10 };
    case "chaotic":      return { coverage: 0.16, distribution: 0.14, diversity: 0.22, territory: 0.22, antiBias: 0.18, cluster: 0.08 };
  }
}

export function scoreGame(numbers: Dezena[], ctx: ScoreContext, metrics?: GameMetrics): ScoreBreakdown {
  const m = metrics ?? computeMetrics(numbers);
  const cov = (coverageScore(m) * 0.6 + gridCoverageScore(m) * 0.4);
  const dist = distributionScore(m);
  const div = diversityVsSet(numbers, ctx.reference);
  const terr = territoryScore(numbers, ctx.usage);
  const ab = antiBiasScore(numbers, m) * recencyPenalty(numbers, ctx.recentDraws);
  const cl = clusterPenalty(m);

  const w = weightsFor(ctx.lineage);
  const total =
    cov * w.coverage +
    dist * w.distribution +
    div * w.diversity +
    terr * w.territory +
    ab * w.antiBias +
    cl * w.cluster;

  return {
    coverage: cov,
    distribution: dist,
    diversity: div,
    territory: terr,
    antiBias: ab,
    clusterPenalty: cl,
    total: Math.max(0, Math.min(1, total)),
  };
}
