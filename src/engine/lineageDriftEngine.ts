// Lineage Drift Engine
// Detecta quando uma linhagem perdeu sua identidade estratégica.

import { LineageId, GenerationResult } from "./lotteryTypes";

export interface LineageSignature {
  lineageId: LineageId;
  avgEntropy: number; // dispersão esperada
  avgScore: number;
  stabilityTarget: number;
  lastObserved: number; // timestamp
}

export interface DriftDetection {
  lineage: LineageId;
  driftMagnitude: number; // 0-1
  status: 'healthy' | 'drifting' | 'lost';
  expectedBehavior: string;
  observedBehavior: string;
  recommendation: string;
}

export class LineageDriftEngine {
  private signatures: Map<LineageId, LineageSignature> = new Map();
  private history: Map<LineageId, { entropy: number; score: number }[]> = new Map();

  recordLineageBehavior(result: GenerationResult) {
    for (const batch of result.batches) {
      for (const game of batch.games) {
        const lin = game.lineage;
        const entropy = this.calculateEntropy(game.numbers);

        if (!this.history.has(lin)) this.history.set(lin, []);
        this.history.get(lin)!.push({ entropy, score: game.score.total });

        // Keep only last 30 records per lineage
        const hist = this.history.get(lin)!;
        if (hist.length > 30) hist.splice(0, hist.length - 30);

        // Update or create signature
        if (!this.signatures.has(lin)) {
          this.signatures.set(lin, {
            lineageId: lin,
            avgEntropy: entropy,
            avgScore: game.score.total,
            stabilityTarget: 0.5, // default, should be set per lineage
            lastObserved: Date.now()
          });
        } else {
          const sig = this.signatures.get(lin)!;
          sig.avgEntropy = (sig.avgEntropy * 0.7 + entropy * 0.3);
          sig.avgScore = (sig.avgScore * 0.7 + game.score.total * 0.3);
          sig.lastObserved = Date.now();
        }
      }
    }
  }

  detectDrift(lineage: LineageId): DriftDetection | null {
    const sig = this.signatures.get(lineage);
    const hist = this.history.get(lineage);

    if (!sig || !hist || hist.length < 5) return null;

    const recent = hist.slice(-5);
    const older = hist.slice(Math.max(0, hist.length - 15), hist.length - 5);

    if (older.length === 0) return null;

    const recentEntropy = recent.reduce((s, h) => s + h.entropy, 0) / recent.length;
    const olderEntropy = older.reduce((s, h) => s + h.entropy, 0) / older.length;
    const recentScore = recent.reduce((s, h) => s + h.score, 0) / recent.length;
    const olderScore = older.reduce((s, h) => s + h.score, 0) / older.length;

    const driftMagnitude = Math.abs(recentEntropy - olderEntropy) + Math.abs(recentScore - olderScore) / 2;

    let status: 'healthy' | 'drifting' | 'lost' = 'healthy';
    let recommendation = '';

    if (driftMagnitude > 0.3) {
      status = 'drifting';
      if (recentEntropy < olderEntropy * 0.7) {
        recommendation = `Linhagem ${lineage} convergindo demais - aumentar pressão de exploração`;
      } else if (recentEntropy > olderEntropy * 1.3) {
        recommendation = `Linhagem ${lineage} muito dispersiva - reforçar estrutura`;
      }
    }
    if (driftMagnitude > 0.6) {
      status = 'lost';
      recommendation = `Linhagem ${lineage} perdeu identidade - considerar reset ou substituição`;
    }

    const expectedBehavior = this.getExpectedBehavior(lineage);
    const observedBehavior = this.getObservedBehavior(recentEntropy, recentScore);

    return {
      lineage,
      driftMagnitude: Math.min(1, driftMagnitude),
      status,
      expectedBehavior,
      observedBehavior,
      recommendation
    };
  }

  getAllDrifts(): DriftDetection[] {
    const drifts: DriftDetection[] = [];
    for (const lineage of this.signatures.keys()) {
      const drift = this.detectDrift(lineage);
      if (drift) drifts.push(drift);
    }
    return drifts.filter(d => d.status !== 'healthy');
  }

  private calculateEntropy(numbers: number[]): number {
    const groups = [0, 0, 0, 0]; // 0-24, 25-49, 50-74, 75-99
    for (const n of numbers) {
      groups[Math.floor(n / 25)]++;
    }
    let entropy = 0;
    for (const g of groups) {
      if (g > 0) {
        const p = g / 50;
        entropy -= p * Math.log2(p);
      }
    }
    return entropy / 2; // normalized
  }

  private getExpectedBehavior(lineage: LineageId): string {
    const behaviors: Record<LineageId, string> = {
      'alpha': 'Estável, estruturado, baixa variância',
      'sigma': 'Equilíbrio, moderada exploração',
      'delta': 'Explorador, média variância',
      'omega': 'Caótico, alta dispersão, inovação',
      'conservative': 'Conservador, muito estruturado',
      'chaotic': 'Caótico, explorador agressivo',
      'dispersive': 'Dispersivo, máxima cobertura',
      'anticrowd': 'Anti-padrão humano, ruptura'
    };
    return behaviors[lineage] || 'Comportamento desconhecido';
  }

  private getObservedBehavior(entropy: number, score: number): string {
    return `Entropia: ${entropy.toFixed(2)}, Score: ${score.toFixed(2)}`;
  }
}

export const lineageDriftEngine = new LineageDriftEngine();