import { Dezena, GAME_SIZE, Game } from "./lotteryTypes";

/** Similaridade Jaccard entre dois jogos (0..1, 1 = idênticos). */
export function jaccard(a: Dezena[], b: Dezena[]): number {
  const sa = new Set(a);
  let inter = 0;
  for (const n of b) if (sa.has(n)) inter++;
  const uni = a.length + b.length - inter;
  return uni === 0 ? 0 : inter / uni;
}

/** Distância simples baseada em interseção: 0..1, 1 = totalmente diferentes. */
export function diff(a: Dezena[], b: Dezena[]): number {
  const sa = new Set(a);
  let inter = 0;
  for (const n of b) if (sa.has(n)) inter++;
  // máx interseção = 50, mín = 0 (impossível dado domínio 100, mín real é 50+50-100=0)
  return 1 - inter / GAME_SIZE;
}

/** Diversidade média intra-lote (0..1, 1 = lote muito diverso). */
export function batchDiversity(games: Pick<Game, "numbers">[]): number {
  if (games.length < 2) return 1;
  let sum = 0, count = 0;
  for (let i = 0; i < games.length; i++) {
    for (let j = i + 1; j < games.length; j++) {
      sum += diff(games[i].numbers, games[j].numbers);
      count++;
    }
  }
  return sum / count;
}

/** Diversidade do jogo `g` em relação a um conjunto de referência. */
export function diversityVsSet(g: Dezena[], reference: Dezena[][]): number {
  if (reference.length === 0) return 1;
  let s = 0;
  for (const r of reference) s += diff(g, r);
  return s / reference.length;
}

/** Detecta jogos estruturalmente redundantes (interseção alta). */
export function isRedundant(g: Dezena[], reference: Dezena[][], threshold = 0.78): boolean {
  for (const r of reference) {
    const sim = 1 - diff(g, r);
    if (sim >= threshold) return true;
  }
  return false;
}
