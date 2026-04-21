import { Dezena, GAME_SIZE, DOMAIN_SIZE, LineageId } from "./lotteryTypes";
import { RNG, defaultRNG, shuffle, weightedPickIndex } from "./rng";
import { scoreGame, ScoreContext } from "./scoreEngine";
import { generateForLineage } from "./lineageEngine";

/**
 * Genetic Algorithm — FIXED v2
 * P4 FIX: usa ctx.reference (lote parcial) para que o GA evolua candidatos
 * cientes do contexto real do lote, não apenas do score individual isolado.
 * Exporta métricas de ganho geracional real.
 */

export interface EvolveOptions {
  populationSize?: number;
  generations?: number;
  eliteFrac?: number;
  baseMutationRate?: number;
  rng?: RNG;
}

/** Métricas de ganho geracional do GA. */
export interface GenerationalMetrics {
  initialAvgScore: number;
  finalBestScore: number;
  gain: number; // finalBestScore - initialAvgScore
  generationsRun: number;
  stagnatedGenerations: number;
}

export function crossover(a: Dezena[], b: Dezena[], rng: RNG): Dezena[] {
  const both = new Set<Dezena>();
  const setA = new Set(a);
  const setB = new Set(b);
  for (const n of a) if (setB.has(n)) both.add(n);
  const child = new Set<Dezena>(Array.from(both).slice(0, Math.min(both.size, Math.floor(GAME_SIZE * 0.6))));
  const restA = a.filter(n => !child.has(n));
  const restB = b.filter(n => !child.has(n));
  shuffle(restA, rng).forEach((n, i) => { if (i % 2 === 0 && child.size < GAME_SIZE) child.add(n); });
  shuffle(restB, rng).forEach(n => { if (child.size < GAME_SIZE) child.add(n); });
  while (child.size < GAME_SIZE) {
    const cand = Math.floor(rng() * DOMAIN_SIZE);
    child.add(cand);
  }
  return Array.from(child).sort((x, y) => x - y);
}

export function mutate(genome: Dezena[], rate: number, rng: RNG, weights?: number[]): Dezena[] {
  const set = new Set(genome);
  const swaps = Math.max(1, Math.round(rate * GAME_SIZE));
  for (let i = 0; i < swaps; i++) {
    const list = Array.from(set);
    const removed = list[Math.floor(rng() * list.length)];
    set.delete(removed);
    const pool: number[] = [];
    const w: number[] = [];
    for (let n = 0; n < DOMAIN_SIZE; n++) {
      if (set.has(n)) continue;
      pool.push(n);
      w.push(weights ? weights[n] : 1);
    }
    const idx = weightedPickIndex(rng, w);
    set.add(pool[idx]);
  }
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Evolve — P4 FIX: usa ctx.reference para score contextual do lote.
 * Retorna o melhor genoma evoluído. Nunca retorna fallback silencioso.
 */
export function evolve(
  lineage: LineageId,
  ctx: ScoreContext,
  opts: EvolveOptions = {}
): Dezena[] {
  const rng = opts.rng ?? defaultRNG;
  const populationSize = opts.populationSize ?? 36;
  const generations = opts.generations ?? 22;
  const eliteFrac = opts.eliteFrac ?? 0.25;
  const baseRate = opts.baseMutationRate ?? 0.08;

  // Pesos territoriais a partir do uso (favorece dezenas pouco usadas)
  const weights = ctx.usage.map(u => {
    const expected = (ctx.usage.reduce((s, v) => s + v, 0) / DOMAIN_SIZE) || 1;
    return Math.max(0.05, Math.pow((expected + 0.5) / (u + 0.5), 0.6));
  });

  // P4 FIX: aplicar modificadores de peso pré-gen se disponíveis via ctx
  // (zonas bloqueadas do preGenEcosystem entram aqui como weights[n] muito baixos)
  const effectiveWeights = (ctx as any).preGenWeightModifiers
    ? weights.map((w, i) => w * Math.max(0.01, (ctx as any).preGenWeightModifiers[i]))
    : weights;

  // População inicial
  let pop: { g: Dezena[]; s: number }[] = Array.from({ length: populationSize }, () => {
    const g = generateForLineage(lineage, rng, effectiveWeights);
    // P4 FIX: score já inclui ctx.reference (lote parcial) desde a população inicial
    return { g, s: scoreGame(g, ctx).total };
  });

  const initialAvgScore = pop.reduce((s, p) => s + p.s, 0) / pop.length;

  let bestEver = pop.reduce((a, b) => b.s > a.s ? b : a);
  let stagnation = 0;
  let mutationRate = baseRate;

  for (let gen = 0; gen < generations; gen++) {
    pop.sort((a, b) => b.s - a.s);
    const top = pop[0];
    if (top.s > bestEver.s) { bestEver = top; stagnation = 0; }
    else stagnation++;

    const diversity = populationDiversity(pop.map(p => p.g));
    mutationRate = baseRate + (stagnation > 3 ? 0.1 : 0) + (diversity < 0.45 ? 0.12 : 0);
    mutationRate = Math.min(0.4, mutationRate);

    const eliteN = Math.max(2, Math.floor(populationSize * eliteFrac));
    const elite = pop.slice(0, eliteN);

    const next: { g: Dezena[]; s: number }[] = elite.slice();
    while (next.length < populationSize) {
      const a = tournament(pop, rng);
      const b = tournament(pop, rng);
      let child = crossover(a.g, b.g, rng);
      child = mutate(child, mutationRate, rng, effectiveWeights);
      // P4 FIX: score contextual durante evolução (usa reference do lote)
      const s = scoreGame(child, ctx).total;
      next.push({ g: child, s });
    }
    pop = next;
  }
  pop.sort((a, b) => b.s - a.s);
  return pop[0].s > bestEver.s ? pop[0].g : bestEver.g;
}

/** Versão com métricas de ganho — usada nos testes comparativos. */
export function evolveWithMetrics(
  lineage: LineageId,
  ctx: ScoreContext,
  opts: EvolveOptions = {}
): { genome: Dezena[]; metrics: GenerationalMetrics } {
  const rng = opts.rng ?? defaultRNG;
  const populationSize = opts.populationSize ?? 36;
  const generations = opts.generations ?? 22;
  const eliteFrac = opts.eliteFrac ?? 0.25;
  const baseRate = opts.baseMutationRate ?? 0.08;

  const weights = ctx.usage.map(u => {
    const expected = (ctx.usage.reduce((s, v) => s + v, 0) / DOMAIN_SIZE) || 1;
    return Math.max(0.05, Math.pow((expected + 0.5) / (u + 0.5), 0.6));
  });

  let pop: { g: Dezena[]; s: number }[] = Array.from({ length: populationSize }, () => {
    const g = generateForLineage(lineage, rng, weights);
    return { g, s: scoreGame(g, ctx).total };
  });

  const initialAvgScore = pop.reduce((s, p) => s + p.s, 0) / pop.length;
  let bestEver = pop.reduce((a, b) => b.s > a.s ? b : a);
  let stagnation = 0;
  let mutationRate = baseRate;
  let stagnatedGens = 0;

  for (let gen = 0; gen < generations; gen++) {
    pop.sort((a, b) => b.s - a.s);
    const top = pop[0];
    if (top.s > bestEver.s) { bestEver = top; stagnation = 0; }
    else { stagnation++; stagnatedGens++; }

    const diversity = populationDiversity(pop.map(p => p.g));
    mutationRate = baseRate + (stagnation > 3 ? 0.1 : 0) + (diversity < 0.45 ? 0.12 : 0);
    mutationRate = Math.min(0.4, mutationRate);

    const eliteN = Math.max(2, Math.floor(populationSize * eliteFrac));
    const elite = pop.slice(0, eliteN);
    const next: { g: Dezena[]; s: number }[] = elite.slice();
    while (next.length < populationSize) {
      const a = tournament(pop, rng);
      const b = tournament(pop, rng);
      let child = crossover(a.g, b.g, rng);
      child = mutate(child, mutationRate, rng, weights);
      next.push({ g: child, s: scoreGame(child, ctx).total });
    }
    pop = next;
  }
  pop.sort((a, b) => b.s - a.s);
  const finalGenome = pop[0].s > bestEver.s ? pop[0].g : bestEver.g;
  const finalScore = Math.max(pop[0].s, bestEver.s);

  return {
    genome: finalGenome,
    metrics: {
      initialAvgScore,
      finalBestScore: finalScore,
      gain: finalScore - initialAvgScore,
      generationsRun: generations,
      stagnatedGenerations: stagnatedGens,
    }
  };
}

function tournament(pop: { g: Dezena[]; s: number }[], rng: RNG, k = 3) {
  let best = pop[Math.floor(rng() * pop.length)];
  for (let i = 1; i < k; i++) {
    const c = pop[Math.floor(rng() * pop.length)];
    if (c.s > best.s) best = c;
  }
  return best;
}

function populationDiversity(genomes: Dezena[][]): number {
  if (genomes.length < 2) return 1;
  const sample = Math.min(genomes.length, 12);
  let s = 0, c = 0;
  for (let i = 0; i < sample; i++) {
    for (let j = i + 1; j < sample; j++) {
      const sa = new Set(genomes[i]);
      let inter = 0;
      for (const n of genomes[j]) if (sa.has(n)) inter++;
      s += 1 - inter / GAME_SIZE;
      c++;
    }
  }
  return s / c;
}
