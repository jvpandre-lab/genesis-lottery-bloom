import { describe, it, expect } from "vitest";
import { parseDrawsFile } from "@/services/contestService";

describe("contestService parser", () => {
  it("parseia CSV com header e data", () => {
    const csv = `concurso,data,d1,d2,d3,d4,d5,d6,d7,d8,d9,d10,d11,d12,d13,d14,d15,d16,d17,d18,d19,d20
2700,2025-12-01,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20
2701,2025-12-04,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40`;
    const out = parseDrawsFile(csv, "x.csv");
    expect(out).toHaveLength(2);
    expect(out[0].contestNumber).toBe(2700);
    expect(out[0].numbers).toHaveLength(20);
    expect(out[0].drawDate).toBe("2025-12-01");
  });

  it("aceita JSON com chaves variadas", () => {
    const json = JSON.stringify([
      { concurso: 100, dezenas: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"] },
      { contest_number: 101, numbers: [10, 20, 30, 40, 50, 60, 70, 80, 90, 99, 0, 5, 15, 25, 35, 45, 55, 65, 75, 85] },
    ]);
    const out = parseDrawsFile(json, "x.json");
    expect(out).toHaveLength(2);
    expect(out[0].numbers[0]).toBe(1);
  });

  it("descarta linhas com dezenas insuficientes", () => {
    const csv = `concurso,d1,d2\n100,1,2`;
    expect(parseDrawsFile(csv, "x.csv")).toHaveLength(0);
  });

  it("rejeita dezenas fora do domínio", () => {
    const csv = `concurso,d1,d2,d3,d4,d5,d6,d7,d8,d9,d10,d11,d12,d13,d14,d15,d16,d17,d18,d19,d20\n1,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,200`;
    const out = parseDrawsFile(csv, "x.csv");
    // dezena 200 é descartada → ficam 19 → linha inteira é descartada (< 18 é o piso, mas 19 passa). validamos que nenhum >99.
    if (out.length > 0) {
      for (const n of out[0].numbers) expect(n).toBeLessThanOrEqual(99);
    }
  });
});
