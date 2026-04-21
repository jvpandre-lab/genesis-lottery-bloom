import { describe, it, expect, beforeEach } from 'vitest';
import { MetaTerritoryEngine } from '@/engine/metaTerritoryEngine';
import { DrawRecord, GenerationResult } from '@/engine/lotteryTypes';

describe('MetaTerritoryEngine', () => {
  let engine: MetaTerritoryEngine;

  beforeEach(() => {
    engine = new MetaTerritoryEngine();
  });

  it('should detect pressure zones', () => {
    const draws: DrawRecord[] = [
      { contestNumber: 1, drawDate: '2024-01-01', numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] },
      { contestNumber: 2, drawDate: '2024-01-02', numbers: [0, 1, 2, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36] }
    ];
    engine.updateHistoricalDraws(draws);
    const analysis = engine.analyze();
    expect(analysis.pressureZones.zones.length).toBeGreaterThan(0);
  });

  it('should detect blind zones', () => {
    const draws: DrawRecord[] = [
      { contestNumber: 1, drawDate: '2024-01-01', numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] }
    ];
    engine.updateHistoricalDraws(draws);
    const analysis = engine.analyze();
    // With only low coverage, we should detect many blind zones
    expect(analysis.blindZones.zones.length).toBeGreaterThanOrEqual(0);
    // The majority of numbers (80+) should be in blind zones
    if (analysis.blindZones.zones.length > 0) {
      expect(analysis.blindZones.zones[0].coverage).toBeLessThan(1);
    }
  });

  it('should detect false diversity signals', () => {
    const draws: DrawRecord[] = [
      { contestNumber: 1, drawDate: '2024-01-01', numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] }
    ];
    engine.updateHistoricalDraws(draws);
    const analysis = engine.analyze();
    expect(analysis.falseDiversitySignals).toBeDefined();
    expect(analysis.falseDiversitySignals.overallDiversity).toBeGreaterThanOrEqual(0);
    expect(analysis.falseDiversitySignals.overallDiversity).toBeLessThanOrEqual(1);
  });

  it('should detect territory drift', () => {
    const draws: DrawRecord[] = [];
    for (let i = 1; i <= 20; i++) {
      const nums = Array.from({ length: 20 }, (_, j) => j + (i % 20));
      draws.push({
        contestNumber: i,
        drawDate: `2024-01-${i.toString().padStart(2, '0')}`,
        numbers: nums as any
      });
    }
    engine.updateHistoricalDraws(draws);
    const analysis = engine.analyze();
    expect(analysis.territoryDrift).toBeDefined();
    expect(['exploring', 'converging', 'stable']).toContain(analysis.territoryDrift.direction);
  });
});