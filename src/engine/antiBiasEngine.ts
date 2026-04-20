import { Dezena, GAME_SIZE, GameMetrics } from "./lotteryTypes";

/**
 * Anti-Bias / Anti-Multidão.
 * Penaliza padrões "humanos" que tendem a ser jogados em massa:
 * - sequências longas
 * - simetria por faixa
 * - excesso de números "redondos" / repetições visuais
 * - viés por último concurso (similaridade alta com draws recentes)
 */

/** Detecta runs (sequências consecutivas) e devolve a maior. */
export function longestRun(sortedNumbers: Dezena[]): number {
  if (sortedNumbers.length === 0) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < sortedNumbers.length; i++) {
    if (sortedNumbers[i] === sortedNumbers[i - 1] + 1) {
      cur++;
      if (cur > best) best = cur;
    } else cur = 1;
  }
  return best;
}

/** Score anti-padrão humano (0..1, 1 = nada óbvio). */
export function antiBiasScore(numbers: Dezena[], m: GameMetrics): number {
  const sorted = numbers.slice().sort((a, b) => a - b);
  // Penaliza runs >= 5
  const run = longestRun(sorted);
  const runPart = 1 - Math.min(1, Math.max(0, run - 4) / 6);

  // Penaliza simetria perfeita por faixa (todas faixas com mesmo número)
  const dec = m.decadeCounts;
  const ideal = GAME_SIZE / 10;
  const allEqual = dec.every((v) => v === ideal);
  const symPart = allEqual ? 0.6 : 1; // perfeição é suspeita

  // Penaliza muitos múltiplos de 10 (00,10,20...) — preferência humana
  const round10 = numbers.filter((n) => n % 10 === 0).length;
  const roundPart = 1 - Math.min(1, Math.max(0, round10 - 6) / 4);

  // Penaliza muitos múltiplos de 5 (excesso de "bonitos")
  const mult5 = numbers.filter((n) => n % 5 === 0).length;
  const m5Part = 1 - Math.min(1, Math.max(0, mult5 - 14) / 6);

  return runPart * 0.4 + symPart * 0.15 + roundPart * 0.25 + m5Part * 0.2;
}

/** Penaliza similaridade com draws recentes (anti-viés do último concurso). */
export function recencyPenalty(numbers: Dezena[], recentDraws: Dezena[][]): number {
  if (recentDraws.length === 0) return 1;
  const set = new Set(numbers);
  let worst = 0;
  for (const d of recentDraws) {
    let inter = 0;
    for (const n of d) if (set.has(n)) inter++;
    // d tem 20 dezenas; máx interseção = 20
    const sim = inter / d.length;
    if (sim > worst) worst = sim;
  }
  // sim natural esperado ≈ 0.5 (50/100). Penaliza > 0.7.
  return 1 - Math.min(1, Math.max(0, worst - 0.7) / 0.3);
}
