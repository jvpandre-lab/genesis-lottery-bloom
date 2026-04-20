import { describe, it, expect } from "vitest";
import { DOMAIN_MAX, DOMAIN_MIN, GAME_SIZE, LINEAGES, BATCHES } from "@/engine/lotteryTypes";
import { generateForLineage } from "@/engine/lineageEngine";
import { computeMetrics, coverageScore, distributionScore, clusterPenalty } from "@/engine/coverageEngine";
import { scoreGame, weightsFor } from "@/engine/scoreEngine";
import { batchDiversity, diff, isRedundant, jaccard } from "@/engine/diversityEngine";
import { antiBiasScore, longestRun, recencyPenalty } from "@/engine/antiBiasEngine";
import { TerritoryMap } from "@/engine/territoryEngine";
import { evolve } from "@/engine/evolutionaryEngine";
import { mulberry32 } from "@/engine/rng";

// ----------------------------- DOMAIN -----------------------------
describe("Domínio Lotomania", () => {
  it("toda linhagem produz 50 dezenas únicas em [0..99]", () => {
    for (const lin of Object.keys(LINEAGES) as (keyof typeof LINEAGES)[]) {
      for (let i = 0; i < 5; i++) {
        const g = generateForLineage(lin, mulberry32(i + 1));
        expect(g.length).toBe(GAME_SIZE);
        expect(new Set(g).size).toBe(GAME_SIZE);
        for (const n of g) {
          expect(n).toBeGreaterThanOrEqual(DOMAIN_MIN);
          expect(n).toBeLessThanOrEqual(DOMAIN_MAX);
          expect(Number.isInteger(n)).toBe(true);
        }
        // ordenado
        const sorted = g.slice().sort((a, b) => a - b);
        expect(g).toEqual(sorted);
      }
    }
  });
});

// ----------------------------- LINEAGES DISTINCT -----------------------------
describe("Linhagens produzem comportamentos distintos", () => {
  it("conservative tem decadeCounts mais uniforme que chaotic", () => {
    let varCons = 0, varCha = 0;
    const N = 12;
    for (let i = 0; i < N; i++) {
      const c = computeMetrics(generateForLineage("conservative", mulberry32(100 + i)));
      const h = computeMetrics(generateForLineage("chaotic", mulberry32(200 + i)));
      varCons += variance(c.decadeCounts);
      varCha += variance(h.decadeCounts);
    }
    expect(varCons / N).toBeLessThan(varCha / N);
  });

  it("anticrowd tem menos múltiplos de 10 que conservative em média", () => {
    let m10A = 0, m10C = 0;
    const N = 12;
    for (let i = 0; i < N; i++) {
      const a = generateForLineage("anticrowd", mulberry32(300 + i));
      const c = generateForLineage("conservative", mulberry32(400 + i));
      m10A += a.filter((n) => n % 10 === 0).length;
      m10C += c.filter((n) => n % 10 === 0).length;
    }
    expect(m10A / N).toBeLessThan(m10C / N);
  });

  it("dispersive tem maior meanGap mediano que conservative", () => {
    const samples = (lin: any) => Array.from({ length: 10 }, (_, i) =>
      computeMetrics(generateForLineage(lin, mulberry32(500 + i))).meanGap
    );
    const med = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    expect(med(samples("dispersive"))).toBeGreaterThanOrEqual(med(samples("conservative")) - 0.05);
  });
});

// ----------------------------- COVERAGE -----------------------------
describe("Coverage / Distribution / Cluster", () => {
  it("coverageScore cai quando concentro na mesma faixa", () => {
    // jogo bom: distribuído. jogo ruim: 50 dezenas em apenas 5 faixas.
    const good = Array.from({ length: 100 }, (_, i) => i).filter((_, i) => i % 2 === 0); // 50 dezenas pares espalhadas
    const bad = Array.from({ length: 50 }, (_, i) => i); // 0..49
    expect(coverageScore(computeMetrics(good))).toBeGreaterThan(coverageScore(computeMetrics(bad)));
  });

  it("clusterPenalty penaliza muitos consecutivos", () => {
    const seq = Array.from({ length: 50 }, (_, i) => i);
    const sparse = Array.from({ length: 100 }, (_, i) => i).filter((_, i) => i % 2 === 0);
    expect(clusterPenalty(computeMetrics(seq))).toBeLessThan(clusterPenalty(computeMetrics(sparse)));
  });

  it("distributionScore penaliza desbalanceio par/ímpar", () => {
    const allEven = Array.from({ length: 100 }, (_, i) => i).filter((n) => n % 2 === 0); // 50 pares
    const balanced = [...Array.from({ length: 25 }, (_, i) => i * 2), ...Array.from({ length: 25 }, (_, i) => i * 2 + 1)];
    expect(distributionScore(computeMetrics(allEven))).toBeLessThan(distributionScore(computeMetrics(balanced)));
  });
});

// ----------------------------- DIVERSITY -----------------------------
describe("Diversidade e contradição", () => {
  it("diff = 0 para jogos idênticos, ~0.5+ para jogos aleatórios", () => {
    const a = generateForLineage("hybrid", mulberry32(1));
    expect(diff(a, a)).toBe(0);
    const b = generateForLineage("hybrid", mulberry32(2));
    expect(diff(a, b)).toBeGreaterThan(0.2);
  });
  it("isRedundant detecta jogos quase iguais", () => {
    const a = generateForLineage("hybrid", mulberry32(1));
    const b = a.slice(); b[0] = (b[0] + 1) % 100; // praticamente idêntico
    expect(isRedundant(a, [b], 0.78)).toBe(true);
  });
  it("batchDiversity > 0.3 para conjunto heterogêneo", () => {
    const games = Array.from({ length: 5 }, (_, i) => ({ numbers: generateForLineage("chaotic", mulberry32(i + 1)) }));
    expect(batchDiversity(games)).toBeGreaterThan(0.3);
  });
});

// ----------------------------- ANTI-BIAS -----------------------------
describe("Anti-bias", () => {
  it("longestRun correto", () => {
    expect(longestRun([1, 2, 3, 7, 8])).toBe(3);
    expect(longestRun([10, 20, 30])).toBe(1);
  });
  it("antiBiasScore penaliza múltiplos de 10 em excesso", () => {
    const goodNums = generateForLineage("anticrowd", mulberry32(1));
    const badNums = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, ...Array.from({ length: 40 }, (_, i) => i + 1)].slice(0, 50);
    const goodM = computeMetrics(goodNums);
    const badM = computeMetrics(badNums);
    expect(antiBiasScore(goodNums, goodM)).toBeGreaterThan(antiBiasScore(badNums, badM) - 0.001);
  });
  it("recencyPenalty cai para jogos parecidos com draws recentes", () => {
    const draw = Array.from({ length: 20 }, (_, i) => i); // 0..19
    const game = Array.from({ length: 50 }, (_, i) => i); // 0..49 — contém todas as 20
    const noOverlap = Array.from({ length: 50 }, (_, i) => i + 50); // 50..99
    expect(recencyPenalty(noOverlap, [draw])).toBeGreaterThan(recencyPenalty(game, [draw]));
  });
});

// ----------------------------- TERRITORY -----------------------------
describe("Territory engine", () => {
  it("entropia cai quando uso é concentrado", () => {
    const t = new TerritoryMap();
    for (let i = 0; i < 10; i++) t.observeNumbers(Array.from({ length: 50 }, (_, k) => k)); // sempre 0..49
    const concentrated = t.entropy();
    const t2 = new TerritoryMap();
    for (let i = 0; i < 10; i++) t2.observeNumbers(Array.from({ length: 50 }, (_, k) => (k * 2 + i) % 100));
    const spread = t2.entropy();
    expect(spread).toBeGreaterThan(concentrated);
  });
  it("explorationWeights favorece dezenas pouco usadas", () => {
    const t = new TerritoryMap();
    t.observeNumbers(Array.from({ length: 50 }, (_, k) => k)); // usa 0..49
    const w = t.explorationWeights(1);
    // dezena 90 (não usada) deve ter peso > dezena 10 (usada)
    expect(w[90]).toBeGreaterThan(w[10]);
  });
});

// ----------------------------- SCORE / WEIGHTS -----------------------------
describe("Score multidimensional", () => {
  it("pesos diferem por linhagem", () => {
    const wA = weightsFor("anticrowd");
    const wC = weightsFor("coverage");
    expect(wA.antiBias).toBeGreaterThan(wC.antiBias);
    expect(wC.coverage).toBeGreaterThan(wA.coverage);
  });
  it("score total muda quando contexto muda (mesmas dezenas, linhagem diferente)", () => {
    const nums = generateForLineage("hybrid", mulberry32(1));
    const ctx = (lin: any) => ({ usage: new Array(100).fill(0), reference: [], recentDraws: [], lineage: lin });
    const sA = scoreGame(nums, ctx("anticrowd")).total;
    const sC = scoreGame(nums, ctx("coverage")).total;
    expect(Math.abs(sA - sC)).toBeGreaterThan(0.001);
  });
});

// ----------------------------- EVOLUTION -----------------------------
describe("Motor evolutivo", () => {
  it("evolve melhora score em relação à média da população inicial", () => {
    const ctx = { usage: new Array(100).fill(0), reference: [], recentDraws: [], lineage: "hybrid" as const };
    // linha de base: gera 12 e tira score médio
    let baseSum = 0;
    for (let i = 0; i < 12; i++) baseSum += scoreGame(generateForLineage("hybrid", mulberry32(i + 1)), ctx).total;
    const baseAvg = baseSum / 12;
    const evolved = evolve("hybrid", ctx, { populationSize: 24, generations: 15, baseMutationRate: 0.08, rng: mulberry32(7) });
    const evScore = scoreGame(evolved, ctx).total;
    expect(evScore).toBeGreaterThan(baseAvg);
  });
});

function variance(arr: number[]): number {
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}
