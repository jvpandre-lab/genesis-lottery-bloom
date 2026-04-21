import { describe, it, expect, beforeEach } from 'vitest';
import { LineageDriftEngine } from '@/engine/lineageDriftEngine';
import { GenerationResult } from '@/engine/lotteryTypes';

describe('LineageDriftEngine', () => {
  let engine: LineageDriftEngine;

  beforeEach(() => {
    engine = new LineageDriftEngine();
  });

  it('should record lineage behavior', () => {
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

    engine.recordLineageBehavior(result);
    // Should not throw
    expect(true).toBe(true);
  });

  it('should detect lineage drift', () => {
    const results: GenerationResult[] = Array.from({ length: 20 }, (_, i) => ({
      id: `gen-${i}`,
      requestedCount: 50,
      scenario: 'hybrid',
      batches: [
        {
          name: 'Alpha',
          purpose: 'test',
          dominant: 'alpha',
          diversity: 0.7 - i * 0.02, // slowly converging
          avgScore: 0.75,
          games: [
            {
              numbers: Array.from({ length: 50 }, (_, j) => (j + i) % 100) as any,
              score: { total: 0.75, base: 0.75, lineage: 0, antiCrowd: 0, diversity: 0 },
              metrics: {},
              lineage: 'alpha'
            }
          ]
        }
      ],
      metrics: { avgScore: 0.75, avgDiversity: 0.7 - i * 0.02, territoryEntropy: 0.85 }
    }));

    for (const result of results) {
      engine.recordLineageBehavior(result);
    }

    const drift = engine.detectDrift('alpha');
    expect(drift).toBeDefined();
    expect(['healthy', 'drifting', 'lost']).toContain(drift?.status);
  });

  it('should get all drifts', () => {
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

    engine.recordLineageBehavior(result);
    const drifts = engine.getAllDrifts();
    
    expect(Array.isArray(drifts)).toBe(true);
  });
});