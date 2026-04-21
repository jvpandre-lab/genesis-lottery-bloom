import { describe, it, expect } from 'vitest';
import { backtestEvolutionaryRetrospective } from '@/engine/backtestEngine';
import { DrawRecord, GenerationResult } from '@/engine/lotteryTypes';

describe('Evolutionary Backtest Retrospective', () => {
  it('should run retrospective backtest', async () => {
    const draws: DrawRecord[] = Array.from({ length: 100 }, (_, i) => ({
      contestNumber: i + 1,
      drawDate: `2024-01-${(i % 30 + 1).toString().padStart(2, '0')}`,
      numbers: Array.from({ length: 20 }, (_, j) => ((i * 7 + j * 3) % 100) as any)
    }));

    const mockGenerate = async (input: any): Promise<GenerationResult> => ({
      id: `gen-${Date.now()}`,
      requestedCount: input.count,
      scenario: input.scenario,
      batches: [
        {
          name: 'Alpha',
          purpose: 'test',
          dominant: 'alpha',
          diversity: 0.7,
          avgScore: 0.75,
          games: Array.from({ length: 10 }, (_, i) => ({
            numbers: Array.from({ length: 50 }, (_, j) => ((i * 5 + j) % 100) as any),
            score: { total: 0.75, base: 0.75, lineage: 0, antiCrowd: 0, diversity: 0 } as any,
            metrics: {} as any,
            lineage: 'alpha' as any
          }))
        }
      ],
      metrics: { avgScore: 0.75, avgDiversity: 0.7, territoryEntropy: 0.85 }
    });

    const report = await backtestEvolutionaryRetrospective(4, 12345, draws, 'hybrid', mockGenerate);
    
    expect(report).toBeDefined();
    expect(report.generations.length).toBeGreaterThanOrEqual(1);
    expect(report.overall).toBeDefined();
    expect(report.overall.avgHits).toBeGreaterThanOrEqual(0);
    expect(report.perLineage).toBeDefined();
    expect(report.perBatch).toBeDefined();
  });

  it('should track stabilty trend over generations', async () => {
    const draws: DrawRecord[] = Array.from({ length: 100 }, (_, i) => ({
      contestNumber: i + 1,
      drawDate: `2024-01-${(i % 30 + 1).toString().padStart(2, '0')}`,
      numbers: Array.from({ length: 20 }, (_, j) => ((i * 7 + j * 3) % 100) as any)
    }));

    const mockGenerate = async (input: any): Promise<GenerationResult> => ({
      id: `gen-${Date.now()}`,
      requestedCount: input.count,
      scenario: input.scenario,
      batches: [
        {
          name: 'Alpha',
          purpose: 'test',
          dominant: 'alpha',
          diversity: 0.7,
          avgScore: 0.75,
          games: []
        }
      ],
      metrics: { avgScore: 0.75, avgDiversity: 0.7, territoryEntropy: 0.85 }
    });

    const report = await backtestEvolutionaryRetrospective(5, 12345, draws, 'hybrid', mockGenerate);
    
    expect(report.overall.stabilityTrend).toBeDefined();
    expect(report.overall.saturationTrend).toBeDefined();
    expect(report.overall.convergenceTrend).toBeDefined();
  });

  it('should throw error with insufficient draws', async () => {
    const draws: DrawRecord[] = Array.from({ length: 5 }, (_, i) => ({
      contestNumber: i + 1,
      drawDate: `2024-01-01`,
      numbers: Array.from({ length: 20 }, (_, j) => j as any)
    }));

    const mockGenerate = async (input: any): Promise<GenerationResult> => ({
      id: '1',
      requestedCount: 50,
      scenario: 'hybrid',
      batches: [],
      metrics: { avgScore: 0.75, avgDiversity: 0.7, territoryEntropy: 0.85 }
    });

    try {
      await backtestEvolutionaryRetrospective(10, 12345, draws, 'hybrid', mockGenerate);
      expect(true).toBe(false); // Should have thrown
    } catch (e) {
      expect(true).toBe(true);
    }
  });
});