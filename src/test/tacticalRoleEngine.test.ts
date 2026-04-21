import { describe, it, expect, beforeEach } from 'vitest';
import { TacticalRoleEngine } from '@/engine/tacticalRoleEngine';
import { Game, ScoreBreakdown, GameMetrics } from '@/engine/lotteryTypes';

const mockScore = (): ScoreBreakdown => ({
  coverage: 0.7,
  distribution: 0.7,
  diversity: 0.7,
  territory: 0.7,
  antiBias: 0.7,
  clusterPenalty: 0.7,
  total: 0.7
});

const mockMetrics = (): GameMetrics => ({
  evenCount: 25,
  oddCount: 25,
  primeCount: 10,
  sumTotal: 2475,
  meanGap: 2,
  maxGap: 5,
  consecutivePairs: 2,
  decadeCounts: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  rowCounts: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  colCounts: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
});

describe('TacticalRoleEngine', () => {
  let engine: TacticalRoleEngine;

  beforeEach(() => {
    engine = new TacticalRoleEngine();
  });

  it('should assign tactical roles to games', () => {
    const games: Game[] = [
      { numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49], score: mockScore(), metrics: mockMetrics(), lineage: ('alpha' as any) },
      { numbers: [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99], score: mockScore(), metrics: mockMetrics(), lineage: ('omega' as any) }
    ];
    const territory: any = {};
    const tactical = engine.assignRoles(games, territory);
    expect(tactical.length).toBe(2);
    expect(tactical[0]).toHaveProperty('tacticalRole');
    expect(tactical[0]).toHaveProperty('roleScore');
  });

  it('should build tactical lote with composition', () => {
    const games: Game[] = Array.from({ length: 10 }, (_, i) => ({
      numbers: Array.from({ length: 50 }, (_, j) => ((i * 5 + j) % 100) as any),
      score: mockScore(),
      metrics: mockMetrics(),
      lineage: (['alpha', 'sigma', 'delta', 'omega'][i % 4] as any)
    }));

    const batches = [{ name: 'Alpha' as const, games }];
    const territory: any = {};
    const tacticalLote = engine.buildTacticalLote(batches, territory);
    
    expect(tacticalLote).toBeDefined();
    expect(tacticalLote.overallComposition).toBeDefined();
    expect(tacticalLote.tacticalBalance).toBeGreaterThanOrEqual(0);
    expect(tacticalLote.tacticalBalance).toBeLessThanOrEqual(1);
    expect(tacticalLote.batches).toBeDefined();
    expect(Array.isArray(tacticalLote.batches)).toBe(true);
  });

  it('should have balanced composition', () => {
    const games: Game[] = Array.from({ length: 12 }, (_, i) => ({
      numbers: Array.from({ length: 50 }, (_, j) => ((i * 8 + j) % 100) as any),
      score: mockScore(),
      metrics: mockMetrics(),
      lineage: ('alpha' as any)
    }));

    const batches = [{ name: 'Alpha' as const, games }];
    const territory: any = {};
    const tacticalLote = engine.buildTacticalLote(batches, territory);
    
    const totalRoles = Object.values(tacticalLote.overallComposition).reduce((s: number, v: number) => s + v, 0);
    expect(totalRoles).toBe(games.length);
  });
});