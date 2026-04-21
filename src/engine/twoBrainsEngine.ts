// Two-Brain + Arbiter — FIXED v2
// Brain A: estabilidade estrutural + cobertura forte (linhagens conservative/coverage/hybrid)
// Brain B: exploração + ruptura + anti-convergência (linhagens chaotic/dispersive/anticrowd)
// Arbiter: composição final com fórmula balanceada, hard cap, coverage/cluster/diversity integrados.

import { Dezena, Game, LineageId, BatchName, BATCHES, Scenario } from "./lotteryTypes";
import { evolve } from "./evolutionaryEngine";
import { scoreGame, ScoreContext } from "./scoreEngine";
import { computeMetrics, coverageScore, clusterPenalty } from "./coverageEngine";
import { diff, diversityVsSet, isRedundant } from "./diversityEngine";
import { RNG, defaultRNG } from "./rng";

const BRAIN_A_LINEAGES: LineageId[] = ["conservative", "coverage", "hybrid"];
const BRAIN_B_LINEAGES: LineageId[] = ["chaotic", "dispersive", "anticrowd"];

export interface BrainProposal {
  brain: "A" | "B";
  lineage: LineageId;
  numbers: Dezena[];
  scoreTotal: number;
  diversity: number; // vs reference
  coverageVal: number;
  clusterVal: number;
}

/** Métricas reais do árbitro por lote. */
export interface ArbiterMetrics {
  picksA: number;
  picksB: number;
  targetA: number;
  captureRisk: "none" | "low" | "high";
  arbitrationMargin: number; // diferença média de value entre vencedor e segundo
  scenarioApplied: Scenario;
  hardClamped: boolean; // se o hard cap foi ativado
}

function pickBrainLineage(brain: "A" | "B", batchName: BatchName, slotIdx: number): LineageId {
  const meta = BATCHES[batchName];
  const pool = brain === "A" ? BRAIN_A_LINEAGES : BRAIN_B_LINEAGES;
  if (pool.includes(meta.dominant) && slotIdx === 0) return meta.dominant;
  return pool[slotIdx % pool.length];
}

/** Cada cérebro propõe k candidatos. refGames é o lote parcialmente montado para GA ter contexto real. */
export function proposeFromBrain(
  brain: "A" | "B",
  batchName: BatchName,
  slotIdx: number,
  ctxBase: Omit<ScoreContext, "lineage">,
  k: number,
  rng: RNG = defaultRNG,
): BrainProposal[] {
  const out: BrainProposal[] = [];
  for (let i = 0; i < k; i++) {
    const lineage = pickBrainLineage(brain, batchName, slotIdx + i);
    const ctx: ScoreContext = { ...ctxBase, lineage };
    // P4 FIX: GA agora usa ctxBase.reference (lote parcial) como contexto real de seleção
    const numbers = evolve(lineage, ctx, {
      populationSize: brain === "B" ? 28 : 32,
      generations: brain === "B" ? 14 : 18,
      baseMutationRate: brain === "B" ? 0.15 : 0.07,
      eliteFrac: brain === "B" ? 0.18 : 0.28,
      rng,
    });
    const m = computeMetrics(numbers);
    const s = scoreGame(numbers, ctx, m);
    const cov = coverageScore(m);
    const cl = clusterPenalty(m);
    const div = ctxBase.reference.length === 0
      ? 1
      : diversityVsSet(numbers, ctxBase.reference);
    out.push({ brain, lineage, numbers, scoreTotal: s.total, diversity: div, coverageVal: cov, clusterVal: cl });
  }
  return out;
}

/**
 * Árbitro v2 — fórmula balanceada com:
 *  - score total      (40%) — qualidade individual
 *  - diversidade marginal vs lote aceito (25%) — anti-redundância
 *  - coverageScore    (15%) — punição de concentração por faixa
 *  - clusterPenalty   (10%) — punição de sequências/clusters
 *  - balanceBonus     (10%) — pressão explícita para equilibrar A/B
 *
 * Hard cap: se Brain B atingir maxB slots, apenas Brain A pode vencer.
 * Poda prévia: candidatos com coverage < 0.30 são descartados antes do árbitro.
 */
export function arbitrateBatch(
  candidates: BrainProposal[],
  targetSize: number,
  targetBalanceA: number,
  ctxBase: Omit<ScoreContext, "lineage">,
  scenario: Scenario,
): { selected: BrainProposal[]; reasoning: string[]; metrics: ArbiterMetrics } {
  // P2 FIX: filtro pré-árbitro — remove candidatos degenerados por coverage
  const filtered = candidates.filter(c => c.coverageVal >= 0.30);
  const pool = filtered.length >= targetSize * 2 ? filtered : candidates; // fallback se filtro matar demais

  // P3 FIX: poda de candidatos redundantes entre si antes de entrar no árbitro
  // Remove o candidato com menor score de cada par com similaridade > 0.65
  const pruned = pruneSimilarCandidates(pool, 0.65);

  const accepted: BrainProposal[] = [];
  const reasoning: string[] = [];
  const remaining = [...pruned];
  const margins: number[] = [];

  // Hard cap: Brain B nunca pode passar de 75% do lote, independente do cenário.
  // A fórmula anterior podia produzir maxB > targetSize para cenários com targetBalanceA muito baixo.
  const maxB = Math.min(
    Math.ceil(targetSize * 0.75),                              // cap global absoluto: 75%
    Math.ceil(targetSize * Math.max(0.25, 1 - targetBalanceA + 0.10)), // cap por cenário
  );

  let hardClamped = false;

  while (accepted.length < targetSize && remaining.length > 0) {
    const acceptedA = accepted.filter(c => c.brain === "A").length;
    const acceptedB = accepted.filter(c => c.brain === "B").length;
    const slot = accepted.length + 1;
    const desiredA = Math.round(targetBalanceA * slot);
    const needA = acceptedA < desiredA;
    const bCapped = acceptedB >= maxB;
    if (bCapped) hardClamped = true;

    // P1 FIX: fórmula de valor totalmente rebalanceada
    const ranked = remaining.map(c => {
      const refSet = accepted.map(a => a.numbers);
      // Diversidade marginal vs lote já aceito
      const marginalDiv = refSet.length === 0 ? 1 : diversityVsSet(c.numbers, refSet);

      // P1 FIX: balanceBonus aumentado de 0.08 para 0.25 quando necessário
      let balanceBonus = 0;
      if (needA && c.brain === "A") balanceBonus = 0.25;
      else if (!needA && c.brain === "B" && !bCapped) balanceBonus = 0.05;
      // Se B está no hard cap, Brain B recebe penalidade pesada
      if (bCapped && c.brain === "B") balanceBonus = -0.40;

      // Fórmula v2: 5 dimensões
      const value = c.scoreTotal * 0.40
        + marginalDiv * 0.25
        + c.coverageVal * 0.15
        + c.clusterVal * 0.10
        + balanceBonus;  // ±0.25 agora tem peso real (representa até 25% do value)

      return { c, value, marginalDiv };
    }).sort((a, b) => b.value - a.value);

    if (ranked.length === 0) break;

    // P3 FIX: penalidade hard de similaridade vs aceitos (threshold 0.72)
    let chosen = ranked[0];
    for (const ranked_item of ranked) {
      const tooSimilar = accepted.some(a => (1 - diff(a.numbers, ranked_item.c.numbers)) > 0.72);
      if (!tooSimilar) {
        chosen = ranked_item;
        break;
      }
    }

    accepted.push(chosen.c);
    const margin = ranked.length > 1 ? ranked[0].value - ranked[1].value : 0;
    margins.push(margin);
    reasoning.push(
      `Slot ${accepted.length}: ${chosen.c.brain}/${chosen.c.lineage} ` +
      `score=${chosen.c.scoreTotal.toFixed(3)} ` +
      `divΔ=${chosen.marginalDiv.toFixed(3)} ` +
      `cov=${chosen.c.coverageVal.toFixed(3)} ` +
      `cl=${chosen.c.clusterVal.toFixed(3)} ` +
      `margin=${margin.toFixed(3)}`
    );
    remaining.splice(remaining.indexOf(chosen.c), 1);
  }

  const picksA = accepted.filter(c => c.brain === "A").length;
  const picksB = accepted.filter(c => c.brain === "B").length;
  const captureRisk: "none" | "low" | "high" =
    picksB / Math.max(1, targetSize) > 0.75 ? "high" :
      picksB / Math.max(1, targetSize) > 0.55 ? "low" : "none";

  const metrics: ArbiterMetrics = {
    picksA,
    picksB,
    targetA: Math.round(targetBalanceA * targetSize),
    captureRisk,
    arbitrationMargin: margins.length > 0 ? margins.reduce((s, v) => s + v, 0) / margins.length : 0,
    scenarioApplied: scenario,
    hardClamped,
  };

  return { selected: accepted, reasoning, metrics };
}

/**
 * Remove candidatos redundantes entre si do pool.
 * Para cada par com jaccard(a, b) >= threshold, remove o de menor score.
 */
function pruneSimilarCandidates(candidates: BrainProposal[], threshold: number): BrainProposal[] {
  const alive = [...candidates];
  const dead = new Set<BrainProposal>();
  for (let i = 0; i < alive.length; i++) {
    if (dead.has(alive[i])) continue;
    for (let j = i + 1; j < alive.length; j++) {
      if (dead.has(alive[j])) continue;
      const sim = 1 - diff(alive[i].numbers, alive[j].numbers);
      if (sim >= threshold) {
        // Remove o de menor score
        if (alive[i].scoreTotal >= alive[j].scoreTotal) dead.add(alive[j]);
        else dead.add(alive[i]);
      }
    }
  }
  return alive.filter(c => !dead.has(c));
}

/** Helper: mapeia BrainProposal selecionado para Game. */
export function proposalToGame(p: BrainProposal, ctxBase: Omit<ScoreContext, "lineage">): Game {
  const m = computeMetrics(p.numbers);
  const s = scoreGame(p.numbers, { ...ctxBase, lineage: p.lineage }, m);
  return { numbers: p.numbers, lineage: p.lineage, score: s, metrics: m };
}
