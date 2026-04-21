import { describe, it, expect, beforeEach } from 'vitest';
import { BrainTensionEngine } from '@/engine/brainTensionEngine';
import { GenerationResult } from '@/engine/lotteryTypes';

describe('BrainTensionEngine', () => {
  let engine: BrainTensionEngine;

  beforeEach(() => {
    engine = new BrainTensionEngine();
  });

  it('should record generation metrics', () => {
    const result: GenerationResult = {
      id: '1',
      requestedCount: 50,
      scenario: 'hybrid',
      batches: [],
      metrics: { avgScore: 0.75, avgDiversity: 0.7, territoryEntropy: 0.85 }
    };

    engine.recordGeneration(result, 0.5, 0.3);
    const metrics = engine.getMetrics();
    
    expect(metrics).toBeDefined();
    expect(metrics?.divergenceScore).toBeGreaterThanOrEqual(0);
    expect(metrics?.divergenceScore).toBeLessThanOrEqual(1);
  });

  it('should analyze tension', () => {
    const results: GenerationResult[] = Array.from({ length: 5 }, (_, i) => ({
      id: `gen-${i}`,
      requestedCount: 50,
      scenario: 'hybrid',
      batches: [],
      metrics: { avgScore: 0.75, avgDiversity: 0.5 + i * 0.05, territoryEntropy: 0.85 }
    }));

    for (const result of results) {
      engine.recordGeneration(result, 0.4 + Math.random() * 0.3, 0.3);
    }

    const analysis = engine.analyzeTension();
    
    expect(analysis).toBeDefined();
    expect(analysis.health).toBeGreaterThanOrEqual(0);
    expect(analysis.health).toBeLessThanOrEqual(1);
    expect(analysis.status).toBeTruthy();
    expect(analysis.recommendation).toBeTruthy();
  });

  it('should get health report', () => {
    const result: GenerationResult = {
      id: '1',
      requestedCount: 50,
      scenario: 'hybrid',
      batches: [],
      metrics: { avgScore: 0.75, avgDiversity: 0.7, territoryEntropy: 0.85 }
    };

    engine.recordGeneration(result, 0.5, 0.3);
    const health = engine.getHealthReport();
    
    expect(health).toBeDefined();
    expect(health.brainAStrength).toBeGreaterThanOrEqual(0);
    expect(health.brainAStrength).toBeLessThanOrEqual(1);
    expect(health.brainBStrength).toBeGreaterThanOrEqual(0);
    expect(health.brainBStrength).toBeLessThanOrEqual(1);
    expect(health.arbitratorEffectiveness).toBeGreaterThanOrEqual(0);
    expect(health.arbitratorEffectiveness).toBeLessThanOrEqual(1);
  });

  it('should detect high capture risk', () => {
    const results: GenerationResult[] = Array.from({ length: 5 }, (_, i) => ({
      id: `gen-${i}`,
      requestedCount: 50,
      scenario: 'hybrid',
      batches: [],
      metrics: { avgScore: 0.75, avgDiversity: 0.1 + i * 0.02, territoryEntropy: 0.85 } // low diversity = high divergence risk
    }));

    for (const result of results) {
      engine.recordGeneration(result, 0.1, 0.2); // low divergence
    }

    const analysis = engine.analyzeTension();
    expect(analysis.status).toContain('CRÍTICO') || expect(analysis.health).toBeLessThan(0.5);
  });
});