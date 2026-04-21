import { describe, it, expect, beforeEach } from 'vitest';
import { CycleMemoryEngine } from '@/engine/cycleMemoryEngine';
import { GenerationResult } from '@/engine/lotteryTypes';

describe('CycleMemoryEngine', () => {
  let engine: CycleMemoryEngine;

  beforeEach(() => {
    engine = new CycleMemoryEngine();
  });

  it('should record generation and update cycles', () => {
    const result: GenerationResult = {
      id: '1',
      requestedCount: 50,
      scenario: 'hybrid',
      batches: [
        {
          name: 'Alpha',
          purpose: 'test',
          dominant: 'alpha',
          diversity: 0.7,
          avgScore: 0.75,
          games: [
            {
              numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
              score: { total: 0.75, base: 0.75, lineage: 0, antiCrowd: 0, diversity: 0 },
              metrics: {},
              lineage: 'alpha'
            }
          ]
        }
      ],
      metrics: { avgScore: 0.75, avgDiversity: 0.7, territoryEntropy: 0.85 }
    };

    engine.observeGeneration(result, 'hybrid');
    const health = engine.getCycleHealth('last5');
    
    expect(health).toBeDefined();
    expect(health.healthScore).toBeGreaterThanOrEqual(0);
    expect(health.healthScore).toBeLessThanOrEqual(1);
  });

  it('should track cycle health deterioration', () => {
    const results: GenerationResult[] = Array.from({ length: 5 }, (_, i) => ({
      id: `gen-${i}`,
      requestedCount: 50,
      scenario: 'hybrid',
      batches: [
        {
          name: 'Alpha',
          purpose: 'test',
          dominant: 'alpha',
          diversity: 0.5 - i * 0.05, // degrading
          avgScore: 0.75 - i * 0.02,
          games: []
        }
      ],
      metrics: {
        avgScore: 0.75 - i * 0.02,
        avgDiversity: 0.5 - i * 0.05,
        territoryEntropy: 0.85 - i * 0.03
      }
    }));

    for (const result of results) {
      engine.observeGeneration(result, 'hybrid');
    }

    const health = engine.getCycleHealth('last5');
    expect(health.recoveryNeed).toBe(true);
  });

  it('should get cycle metrics', () => {
    const result: GenerationResult = {
      id: '1',
      requestedCount: 50,
      scenario: 'hybrid',
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
    };

    engine.observeGeneration(result, 'hybrid');
    const metrics = engine.getCycleMetrics('last5');
    
    expect(metrics).toBeDefined();
    expect(metrics?.diversity).toBeGreaterThanOrEqual(0);
    expect(metrics?.saturation).toBeGreaterThanOrEqual(0);
  });
});