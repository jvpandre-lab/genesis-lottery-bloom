// Brain Tension Engine
// Explora e audita a tensão entre os dois cérebros.

import { GenerationResult } from "./lotteryTypes";

export interface BrainTensionMetrics {
  divergenceScore: number; // 0-1, quão diferentes são as propostas
  agreementZones: number[]; // dezenas onde concordam
  conflictZones: number[]; // dezenas onde discordam
  captureRisk: 'none' | 'low' | 'high'; // risco de um dominar o outro
  arbitrationPressure: number; // 0-1, quão difícil foi arbitrar
  brainADominance: number; // 0-1
  brainBDominance: number; // 0-1
}

export class BrainTensionEngine {
  private history: BrainTensionMetrics[] = [];

  recordGeneration(result: GenerationResult, divergence: number, arbitrationDifficulty: number) {
    const metrics: BrainTensionMetrics = {
      divergenceScore: Math.min(1, divergence),
      agreementZones: [],
      conflictZones: [],
      captureRisk: divergence < 0.2 ? 'high' : divergence > 0.6 ? 'none' : 'low',
      arbitrationPressure: Math.min(1, arbitrationDifficulty),
      brainADominance: result.metrics.avgDiversity > 0.65 ? 0.55 : 0.45, // placeholder
      brainBDominance: result.metrics.avgDiversity > 0.65 ? 0.45 : 0.55
    };

    this.history.push(metrics);
    if (this.history.length > 50) this.history = this.history.slice(-50);
  }

  getMetrics(): BrainTensionMetrics | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  analyzeTension(): {
    status: string;
    recommendation: string;
    health: number;
  } {
    if (this.history.length < 3) return { status: 'Insuficiente dados', recommendation: '', health: 0.5 };

    const recent = this.history.slice(-5);
    const avgDivergence = recent.reduce((s, m) => s + m.divergenceScore, 0) / recent.length;
    const avgArbitration = recent.reduce((s, m) => s + m.arbitrationPressure, 0) / recent.length;
    const captureRisks = recent.filter(m => m.captureRisk === 'high').length;

    let status = '';
    let recommendation = '';
    let health = 0.7;

    if (captureRisks > 3) {
      status = 'CRÍTICO: Um cérebro dominando excessivamente';
      recommendation = 'Aumentar pressão do cérebro minoritário ou rebalancear pesos';
      health = 0.3;
    } else if (avgDivergence < 0.2) {
      status = 'Tensão insuficiente - cérebros muito similares';
      recommendation = 'Aumentar diversidade de estratégia entre cérebros';
      health = 0.4;
    } else if (avgDivergence > 0.8) {
      status = 'Tensão extrema - cérebros muito divergentes';
      recommendation = 'Aumentar comunicação entre cérebros ou reforçar árbitro';
      health = 0.5;
    } else if (avgArbitration > 0.7) {
      status = 'Árbitro sob pressão - arbitragem muito difícil';
      recommendation = 'Reforçar lógica de arbitragem ou reduzir divergência';
      health = 0.6;
    } else {
      status = 'Tensão saudável entre estabilidade e ruptura';
      recommendation = 'Manter configuração atual';
      health = 0.8;
    }

    return { status, recommendation, health };
  }

  getHealthReport(): {
    brainAStrength: number;
    brainBStrength: number;
    arbitratorEffectiveness: number;
    overallTensionHealth: number;
  } {
    if (this.history.length === 0) {
      return { brainAStrength: 0.5, brainBStrength: 0.5, arbitratorEffectiveness: 0.5, overallTensionHealth: 0.5 };
    }

    const recent = this.history.slice(-10);
    const avgA = recent.reduce((s, m) => s + m.brainADominance, 0) / recent.length;
    const avgB = recent.reduce((s, m) => s + m.brainBDominance, 0) / recent.length;
    const avgArbitration = 1 - (recent.reduce((s, m) => s + m.arbitrationPressure, 0) / recent.length);
    const avgDivergence = recent.reduce((s, m) => s + m.divergenceScore, 0) / recent.length;

    // Tension health: balanced divergence (not too low, not too high)
    const tensionHealth = avgDivergence > 0.3 && avgDivergence < 0.8 ? 1 : Math.max(0, 1 - Math.abs(avgDivergence - 0.55));

    return {
      brainAStrength: avgA,
      brainBStrength: avgB,
      arbitratorEffectiveness: avgArbitration,
      overallTensionHealth: tensionHealth
    };
  }
}

export const brainTensionEngine = new BrainTensionEngine();