import { Dezena, DOMAIN_SIZE, GAME_SIZE, GameMetrics } from "./lotteryTypes";

const PRIMES = new Set([2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97]);

export function computeMetrics(numbers: Dezena[]): GameMetrics {
  const sorted = numbers.slice().sort((a, b) => a - b);
  let evenCount = 0, oddCount = 0, primeCount = 0, sumTotal = 0;
  const decadeCounts = new Array(10).fill(0);
  const rowCounts = new Array(10).fill(0);
  const colCounts = new Array(10).fill(0);
  for (const n of sorted) {
    if (n % 2 === 0) evenCount++; else oddCount++;
    if (PRIMES.has(n)) primeCount++;
    sumTotal += n;
    decadeCounts[Math.floor(n / 10)]++;
    rowCounts[Math.floor(n / 10)]++;        // grade 10x10 — linha = dezena
    colCounts[n % 10]++;                    // coluna = unidade
  }
  let gapSum = 0, maxGap = 0, consecutive = 0;
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i] - sorted[i - 1];
    gapSum += g;
    if (g > maxGap) maxGap = g;
    if (g === 1) consecutive++;
  }
  const meanGap = sorted.length > 1 ? gapSum / (sorted.length - 1) : 0;
  return { evenCount, oddCount, primeCount, sumTotal, meanGap, maxGap, consecutivePairs: consecutive, decadeCounts, rowCounts, colCounts };
}

/** Cobertura por faixas de 10 — quão uniforme. 1 = perfeitamente uniforme. */
export function coverageScore(m: GameMetrics): number {
  // ideal = GAME_SIZE / 10 = 5 por faixa
  const ideal = GAME_SIZE / 10;
  let dev = 0;
  for (const c of m.decadeCounts) dev += Math.abs(c - ideal);
  // dev máximo teórico: faixa = 50, outras 0 → 45 + 9*5 = 90 → cap 90
  const norm = 1 - Math.min(1, dev / 60);
  return Math.max(0, norm);
}

/** Cobertura grade 10x10 — combina linhas e colunas. */
export function gridCoverageScore(m: GameMetrics): number {
  const ideal = GAME_SIZE / 10;
  let devR = 0, devC = 0;
  for (let i = 0; i < 10; i++) {
    devR += Math.abs(m.rowCounts[i] - ideal);
    devC += Math.abs(m.colCounts[i] - ideal);
  }
  const r = 1 - Math.min(1, devR / 60);
  const c = 1 - Math.min(1, devC / 60);
  return Math.max(0, (r + c) / 2);
}

/** Distribuição: pares/ímpares + soma + gaps + sequências. */
export function distributionScore(m: GameMetrics): number {
  // Pares/ímpares: ideal 25/25. Penaliza não-linearmente (extremos colapsam).
  const parityDev = Math.abs(m.evenCount - GAME_SIZE / 2) / (GAME_SIZE / 2); // 0..1
  // curva: parityDev=0 -> 1; 0.2 -> 0.78; 0.5 -> 0.30; 1 -> 0
  const parity = Math.max(0, 1 - Math.pow(parityDev, 0.6));

  // Soma esperada: média 49.5 * 50 = 2475
  const expectedSum = 2475;
  const sumDev = Math.abs(m.sumTotal - expectedSum) / 1250;
  const sum = 1 - Math.min(1, sumDev);

  // Gaps esperados ~ 2.02
  const gapDev = Math.abs(m.meanGap - 2.02) / 2;
  const gaps = 1 - Math.min(1, gapDev);

  // Sequências consecutivas: poucas é melhor
  const seqPenalty = Math.min(1, Math.max(0, m.consecutivePairs - 8) / 15);
  const seq = 1 - seqPenalty;

  return parity * 0.45 + sum * 0.15 + gaps * 0.20 + seq * 0.20;
}

/** Penalização por clusters fechados (muitos consecutivos / faixa saturada). */
export function clusterPenalty(m: GameMetrics): number {
  // 1 = nenhum cluster. Cai com saturação por faixa.
  const maxDecade = Math.max(...m.decadeCounts);
  const overflow = Math.max(0, maxDecade - 7); // mais de 7/10 numa faixa pesa
  const decadePart = 1 - Math.min(1, overflow / 5);
  const consecPart = 1 - Math.min(1, Math.max(0, m.consecutivePairs - 10) / 20);
  return Math.max(0, (decadePart + consecPart) / 2);
}

/** Cobertura territorial — quanto este jogo explora dezenas pouco usadas. */
export function territoryScore(numbers: Dezena[], usage: number[]): number {
  const expected = (usage.reduce((s, v) => s + v, 0) / DOMAIN_SIZE) || 1;
  let bonus = 0;
  for (const n of numbers) {
    const ratio = (usage[n] + 0.5) / (expected + 0.5);
    // ratio < 1 → sub-explorada → bônus
    bonus += Math.max(0, 1 - ratio);
  }
  return Math.min(1, bonus / GAME_SIZE);
}
