// RNG determinístico (mulberry32) para reprodutibilidade quando útil.
// Por padrão usamos Math.random, mas expomos um RNG seedable.

export type RNG = () => number;

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultRNG: RNG = Math.random;

export function randInt(rng: RNG, minInclusive: number, maxExclusive: number): number {
  return Math.floor(rng() * (maxExclusive - minInclusive)) + minInclusive;
}

export function pickIndex<T>(rng: RNG, arr: T[]): number {
  return Math.floor(rng() * arr.length);
}

export function shuffle<T>(arr: T[], rng: RNG = defaultRNG): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sampleWithoutReplacement(rng: RNG, pool: number[], k: number): number[] {
  if (k > pool.length) throw new Error("k > pool size");
  return shuffle(pool, rng).slice(0, k);
}

export function weightedPickIndex(rng: RNG, weights: number[]): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return Math.floor(rng() * weights.length);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
