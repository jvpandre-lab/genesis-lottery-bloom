// Two-Brain + Arbiter
// Brain A: estabilidade estrutural + cobertura forte (linhagens conservative/coverage/hybrid)
// Brain B: exploração + ruptura + anti-convergência (linhagens chaotic/dispersive/anticrowd)
// Arbiter: escolhe deterministicamente baseado em equilíbrio estratégico do lote.

import { Dezena, Game, LineageId, BatchName, BATCHES } from "./lotteryTypes";
import { evolve } from "./evolutionaryEngine";
import { scoreGame, ScoreContext } from "./scoreEngine";
import { computeMetrics } from "./coverageEngine";
import { diff } from "./diversityEngine";
import { RNG, defaultRNG } from "./rng";

const BRAIN_A_LINEAGES: LineageId[] = ["conservative", "coverage", "hybrid"];
const BRAIN_B_LINEAGES: LineageId[] = ["chaotic", "dispersive", "anticrowd"];

export interface BrainProposal {
  brain: "A" | "B";
  lineage: LineageId;
  numbers: Dezena[];
  scoreTotal: number;
  diversity: number; // vs reference
}

function pickBrainLineage(brain: "A" | "B", batchName: BatchName, slotIdx: number): LineageId {
  const meta = BATCHES[batchName];
  const pool = brain === "A" ? BRAIN_A_LINEAGES : BRAIN_B_LINEAGES;
  // se a linhagem dominante do lote pertence ao brain, prioriza-a
  if (pool.includes(meta.dominant) && slotIdx === 0) return meta.dominant;
  return pool[slotIdx % pool.length];
}

/** Cada cérebro propõe k candidatos. */
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
    const numbers = evolve(lineage, ctx, {
      populationSize: brain === "B" ? 28 : 32,
      generations: brain === "B" ? 14 : 18,
      baseMutationRate: brain === "B" ? 0.15 : 0.07,
      eliteFrac: brain === "B" ? 0.18 : 0.28,
      rng,
    });
    const m = computeMetrics(numbers);
    const s = scoreGame(numbers, ctx, m);
    const div = ctxBase.reference.length === 0 ? 1 : ctxBase.reference.reduce((acc, r) => acc + diff(numbers, r), 0) / ctxBase.reference.length;
    out.push({ brain, lineage, numbers, scoreTotal: s.total, diversity: div });
  }
  return out;
}

/**
 * Arbiter — composição final do lote.
 * Decisão determinística baseada em:
 *  - score absoluto do candidato
 *  - quanto preenche um deficit do lote (diversidade ou cobertura territorial)
 *  - balanço A/B desejado por cenário do lote
 *
 * targetBalance: fração de propostas do Brain A no lote final (0..1).
 */
export function arbitrateBatch(
  candidates: BrainProposal[],
  targetSize: number,
  targetBalanceA: number,
  ctxBase: Omit<ScoreContext, "lineage">,
): { selected: BrainProposal[]; reasoning: string[] } {
  const accepted: BrainProposal[] = [];
  const reasoning: string[] = [];
  const remaining = [...candidates];

  while (accepted.length < targetSize && remaining.length > 0) {
    const acceptedA = accepted.filter((c) => c.brain === "A").length;
    const desiredA = Math.round(targetBalanceA * (accepted.length + 1));
    const needA = acceptedA < desiredA;

    // recompute marginal value para cada candidato considerando os já aceitos
    const ranked = remaining.map((c) => {
      // diversidade marginal vs aceitos
      const refSet = accepted.map((a) => a.numbers);
      const marginalDiv = refSet.length === 0 ? 1 : refSet.reduce((s, r) => s + diff(c.numbers, r), 0) / refSet.length;
      // bônus para o brain necessário para manter equilíbrio
      const balanceBonus = needA && c.brain === "A" ? 0.08 : !needA && c.brain === "B" ? 0.08 : 0;
      // score combinado
      const value = c.scoreTotal * 0.55 + marginalDiv * 0.35 + balanceBonus + c.diversity * 0.05;
      return { c, value, marginalDiv };
    }).sort((a, b) => b.value - a.value);

    const winner = ranked[0];
    // veta redundância forte (similaridade > 0.78)
    const redundant = accepted.some((a) => 1 - diff(a.numbers, winner.c.numbers) > 0.78);
    if (redundant && ranked.length > 1) {
      // pula o vencedor e usa o segundo
      const alt = ranked[1];
      accepted.push(alt.c);
      reasoning.push(`Slot ${accepted.length}: ${alt.c.brain}/${alt.c.lineage} (alternativo, vencedor era redundante)`);
      remaining.splice(remaining.indexOf(alt.c), 1);
    } else {
      accepted.push(winner.c);
      reasoning.push(`Slot ${accepted.length}: ${winner.c.brain}/${winner.c.lineage} score=${winner.c.scoreTotal.toFixed(2)} divΔ=${winner.marginalDiv.toFixed(2)}`);
      remaining.splice(remaining.indexOf(winner.c), 1);
    }
  }
  return { selected: accepted, reasoning };
}

/** Helper: mapeia BrainProposal selecionado para Game. */
export function proposalToGame(p: BrainProposal, ctxBase: Omit<ScoreContext, "lineage">): Game {
  const m = computeMetrics(p.numbers);
  const s = scoreGame(p.numbers, { ...ctxBase, lineage: p.lineage }, m);
  return { numbers: p.numbers, lineage: p.lineage, score: s, metrics: m };
}
