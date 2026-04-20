import { Dezena, DOMAIN_SIZE, GAME_SIZE, LineageId } from "./lotteryTypes";
import { RNG, defaultRNG, sampleWithoutReplacement, weightedPickIndex, shuffle } from "./rng";

/**
 * Lineage Engine — cada linhagem tem seu próprio gerador-base.
 * Todos retornam um vetor de 50 dezenas únicas em [0..99], ordenado.
 *
 * Estes geradores produzem a "primeira população" para o evolutivo.
 */

const ALL: number[] = Array.from({ length: DOMAIN_SIZE }, (_, i) => i);

/** Conservadora: equilíbrio por faixas de 10 e par/ímpar. */
function generateConservative(rng: RNG, usageWeights?: number[]): Dezena[] {
  const picked: Dezena[] = [];
  // 5 dezenas por faixa (perfeito), respeitando ligeira variação para não ser óbvio
  for (let dec = 0; dec < 10; dec++) {
    const low = dec * 10;
    const pool = ALL.slice(low, low + 10);
    const target = 5 + (rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0);
    const k = Math.max(3, Math.min(7, target));
    const chosen = sampleWithoutReplacement(rng, pool, k);
    picked.push(...chosen);
  }
  // ajusta para 50 exatamente
  return enforceSize(picked, rng, usageWeights);
}

/** Dispersiva: maximiza espaçamento global. */
function generateDispersive(rng: RNG, usageWeights?: number[]): Dezena[] {
  // estratégia: amostra com deslocamento near-uniforme + jitter
  const step = DOMAIN_SIZE / GAME_SIZE; // 2
  const offset = rng() * step;
  const out = new Set<Dezena>();
  for (let i = 0; i < GAME_SIZE; i++) {
    const base = Math.floor(offset + i * step);
    const jitter = Math.floor(rng() * 3) - 1; // -1..1
    const candidate = clampDezena(base + jitter);
    let v = candidate;
    let tries = 0;
    while (out.has(v) && tries < 5) { v = clampDezena(v + 1); tries++; }
    if (!out.has(v)) out.add(v); else fillRandom(out, rng, usageWeights);
  }
  return enforceSize(Array.from(out), rng, usageWeights);
}

/** Cobertura: garante mínimo por faixa e por unidade (10x10). */
function generateCoverage(rng: RNG, usageWeights?: number[]): Dezena[] {
  const picked = new Set<Dezena>();
  // garantir ao menos 4 por faixa
  for (let dec = 0; dec < 10; dec++) {
    const pool = ALL.slice(dec * 10, dec * 10 + 10);
    const k = 4 + Math.floor(rng() * 3); // 4..6
    for (const n of sampleWithoutReplacement(rng, pool, k)) picked.add(n);
  }
  // garantir ao menos 4 por unidade (coluna)
  for (let u = 0; u < 10; u++) {
    const pool = ALL.filter((n) => n % 10 === u);
    const have = pool.filter((n) => picked.has(n)).length;
    const need = Math.max(0, 4 - have);
    if (need > 0) {
      for (const n of sampleWithoutReplacement(rng, pool.filter((n) => !picked.has(n)), Math.min(need, 10))) {
        picked.add(n);
      }
    }
  }
  return enforceSize(Array.from(picked), rng, usageWeights);
}

/** Anti-multidão: evita padrões óbvios — sem múltiplos de 10 demais, runs curtas. */
function generateAntiCrowd(rng: RNG, usageWeights?: number[]): Dezena[] {
  const out = new Set<Dezena>();
  const weights = ALL.map((n) => {
    let w = 1;
    if (n % 10 === 0) w *= 0.4;       // evita "redondos"
    if (n % 5 === 0) w *= 0.7;        // evita múltiplos de 5
    if (n < 10) w *= 0.85;            // evita excesso de 0x
    if (usageWeights) w *= usageWeights[n];
    return w;
  });
  while (out.size < GAME_SIZE) {
    const idx = weightedPickIndex(rng, weights.map((w, i) => out.has(i) ? 0 : w));
    out.add(idx);
  }
  // pós-processo: quebra runs > 3
  const arr = Array.from(out).sort((a, b) => a - b);
  const fixed = breakRuns(arr, 3, rng);
  return fixed.slice().sort((a, b) => a - b);
}

/** Híbrida: combina cobertura + dispersão + anti-viés leve. */
function generateHybrid(rng: RNG, usageWeights?: number[]): Dezena[] {
  const base = generateCoverage(rng, usageWeights);
  // perturba 10 trocas com pesos dispersivos
  const set = new Set(base);
  const weights = ALL.map((n) => (set.has(n) ? 0 : (usageWeights ? usageWeights[n] : 1)));
  for (let i = 0; i < 10; i++) {
    const removeIdx = Math.floor(rng() * base.length);
    const removed = base[removeIdx];
    set.delete(removed);
    const ins = weightedPickIndex(rng, weights.map((w, j) => set.has(j) ? 0 : w));
    set.add(ins);
    weights[removed] = 1;
    weights[ins] = 0;
    base[removeIdx] = ins;
  }
  return enforceSize(Array.from(set), rng, usageWeights);
}

/** Caótica controlada: alta entropia respeitando limites mínimos por faixa. */
function generateChaotic(rng: RNG, usageWeights?: number[]): Dezena[] {
  // sample puro com pesos territoriais (favorece sub-explorados)
  const weights = ALL.map((n, i) => (usageWeights ? Math.pow(usageWeights[n], 1.4) : 1));
  const out = new Set<Dezena>();
  while (out.size < GAME_SIZE) {
    const idx = weightedPickIndex(rng, weights.map((w, i) => out.has(i) ? 0 : w));
    out.add(idx);
  }
  // garantir mínimo de 2 por faixa para evitar caos degenerado
  for (let dec = 0; dec < 10; dec++) {
    const inDec = Array.from(out).filter((n) => Math.floor(n / 10) === dec).length;
    if (inDec < 2) {
      const need = 2 - inDec;
      const pool = ALL.slice(dec * 10, dec * 10 + 10).filter((n) => !out.has(n));
      for (const n of sampleWithoutReplacement(rng, pool, need)) {
        // remove um aleatório de faixa com excesso
        removeFromHeaviestDecade(out, dec);
        out.add(n);
      }
    }
  }
  return enforceSize(Array.from(out), rng, usageWeights);
}

// ---------- helpers ----------

function clampDezena(n: number): Dezena {
  if (n < 0) return ((n % DOMAIN_SIZE) + DOMAIN_SIZE) % DOMAIN_SIZE;
  return n % DOMAIN_SIZE;
}

function fillRandom(set: Set<Dezena>, rng: RNG, weights?: number[]) {
  const pool = ALL.filter((n) => !set.has(n));
  if (pool.length === 0) return;
  if (weights) {
    const w = pool.map((n) => weights[n]);
    set.add(pool[weightedPickIndex(rng, w)]);
  } else {
    set.add(pool[Math.floor(rng() * pool.length)]);
  }
}

function enforceSize(arr: Dezena[], rng: RNG, weights?: number[]): Dezena[] {
  const set = new Set(arr);
  while (set.size > GAME_SIZE) {
    const list = Array.from(set);
    set.delete(list[Math.floor(rng() * list.length)]);
  }
  while (set.size < GAME_SIZE) fillRandom(set, rng, weights);
  return Array.from(set).sort((a, b) => a - b);
}

function breakRuns(sorted: Dezena[], maxRun: number, rng: RNG): Dezena[] {
  const set = new Set(sorted);
  let arr = Array.from(set).sort((a, b) => a - b);
  let changed = true, safety = 0;
  while (changed && safety < 30) {
    changed = false; safety++;
    let runStart = 0;
    for (let i = 1; i <= arr.length; i++) {
      const inRun = i < arr.length && arr[i] === arr[i - 1] + 1;
      if (!inRun) {
        const len = i - runStart;
        if (len > maxRun) {
          // remove um do meio da run, insere outro fora
          const mid = arr[runStart + Math.floor(len / 2)];
          set.delete(mid);
          fillRandom(set, rng);
          arr = Array.from(set).sort((a, b) => a - b);
          changed = true;
          break;
        }
        runStart = i;
      }
    }
  }
  return arr;
}

function removeFromHeaviestDecade(set: Set<Dezena>, exceptDec: number) {
  const counts = new Array(10).fill(0);
  for (const n of set) counts[Math.floor(n / 10)]++;
  let heaviest = -1, max = -1;
  for (let i = 0; i < 10; i++) if (i !== exceptDec && counts[i] > max) { max = counts[i]; heaviest = i; }
  if (heaviest < 0) return;
  for (const n of set) if (Math.floor(n / 10) === heaviest) { set.delete(n); break; }
}

export const generators: Record<LineageId, (rng: RNG, w?: number[]) => Dezena[]> = {
  conservative: generateConservative,
  dispersive: generateDispersive,
  coverage: generateCoverage,
  anticrowd: generateAntiCrowd,
  hybrid: generateHybrid,
  chaotic: generateChaotic,
};

export function generateForLineage(lineage: LineageId, rng: RNG = defaultRNG, weights?: number[]): Dezena[] {
  return generators[lineage](rng, weights);
}
