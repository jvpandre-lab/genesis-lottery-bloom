import { describe, it, expect } from "vitest";
import { backtest, countHits, fromGenerationResult } from "@/engine/backtestEngine";
import { generate } from "@/engine/generatorCore";
import { mulberry32 } from "@/engine/rng";
import { PressureEngine } from "@/engine/adaptivePressureEngine";
import { proposeFromBrain, arbitrateBatch } from "@/engine/twoBrainsEngine";

describe("Backtest", () => {
  it("countHits correto", () => {
    expect(countHits([1, 2, 3, 4, 5], [3, 4, 6])).toBe(2);
  });

  it("backtest produz buckets coerentes", async () => {
    const gen = await generate({ count: 3, scenario: "hybrid", rng: mulberry32(11), twoBrains: true });
    const draws = Array.from({ length: 60 }, (_, i) => ({
      contestNumber: 1000 + i,
      numbers: Array.from({ length: 20 }, (_, k) => (i + k * 5) % 100),
    }));
    const rep = backtest([fromGenerationResult(gen)], draws, [50]);
    expect(rep.windows.length).toBe(1);
    expect(rep.windows[0].draws).toBe(50);
    expect(rep.windows[0].totalGames).toBe(3 * 50);
    expect(rep.windows[0].avgHits).toBeGreaterThan(0);
    expect(rep.perLineage.length).toBeGreaterThan(0);
    expect(rep.perBatch.length).toBeGreaterThan(0);
  }, 10000);
});

describe("Two Brains + Arbiter", () => {
  it("árbitro respeita balanceA aproximado", () => {
    const ctxBase = { usage: new Array(100).fill(0), reference: [], recentDraws: [] };
    const A = proposeFromBrain("A", "Alpha", 0, ctxBase, 4, mulberry32(21));
    const B = proposeFromBrain("B", "Alpha", 0, ctxBase, 4, mulberry32(22));
    const { selected } = arbitrateBatch([...A, ...B], 4, 0.75, ctxBase);
    const aShare = selected.filter((c) => c.brain === "A").length / selected.length;
    expect(aShare).toBeGreaterThanOrEqual(0.5);
  });

  it("árbitro produz exatamente targetSize jogos", () => {
    const ctxBase = { usage: new Array(100).fill(0), reference: [], recentDraws: [] };
    const A = proposeFromBrain("A", "Sigma", 0, ctxBase, 5, mulberry32(31));
    const B = proposeFromBrain("B", "Sigma", 0, ctxBase, 5, mulberry32(32));
    const { selected } = arbitrateBatch([...A, ...B], 6, 0.4, ctxBase);
    expect(selected.length).toBe(6);
  });
});

describe("Adaptive pressure", () => {
  it("não dispara ajustes sem histórico suficiente", () => {
    const p = new PressureEngine();
    const adj = p.computeAdjustments("hybrid");
    expect(adj.reasons.length).toBe(0);
  });
});
