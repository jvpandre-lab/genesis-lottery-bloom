// Meta Territory Engine
// Analisa território em camadas: histórico de concursos, gerações do sistema, sessões recentes, por linhagem, cenário.
// Detecta regiões superexploradas, negligenciadas, falsas diversidades, drift territorial.

import { Dezena, DrawRecord, GenerationResult, LineageId, Scenario } from "./lotteryTypes";
import { TerritoryMap } from "./territoryEngine";

export interface PressureZones {
  zones: { dezena: Dezena; pressure: number }[];
}

export interface BlindZones {
  zones: { dezena: Dezena; coverage: number }[];
}

export interface FalseDiversitySignals {
  overallDiversity: number;
  actualCoverage: number;
  falsePositive: boolean;
}

export interface TerritoryDrift {
  driftMagnitude: number;
  direction: 'exploring' | 'converging' | 'stable';
}

export interface MetaTerritoryAnalysis {
  pressureZones: PressureZones;
  blindZones: BlindZones;
  falseDiversitySignals: FalseDiversitySignals;
  territoryDrift: TerritoryDrift;
}

export class MetaTerritoryEngine {
  private historicalDraws: DrawRecord[] = [];
  private generationTerritories: TerritoryMap[] = [];
  private sessionTerritories: TerritoryMap[] = [];
  private lineageTerritories: Map<LineageId, TerritoryMap[]> = new Map();

  updateHistoricalDraws(draws: DrawRecord[]) {
    this.historicalDraws = draws.slice().sort((a, b) => b.contestNumber - a.contestNumber);
  }

  observeGeneration(result: GenerationResult) {
    const territory = this.computeTerritoryFromGames(result.batches.flatMap(b => b.games));
    this.generationTerritories.push(territory);
    if (this.generationTerritories.length > 50) this.generationTerritories = this.generationTerritories.slice(-50);

    // Update session (last 10 generations)
    this.sessionTerritories.push(territory);
    if (this.sessionTerritories.length > 10) this.sessionTerritories = this.sessionTerritories.slice(-10);

    // Update per lineage
    for (const batch of result.batches) {
      for (const game of batch.games) {
        const lin = game.lineage;
        if (!this.lineageTerritories.has(lin)) this.lineageTerritories.set(lin, []);
        const list = this.lineageTerritories.get(lin)!;
        list.push(this.computeTerritoryFromGames([game]));
        if (list.length > 20) list.splice(0, list.length - 20);
      }
    }
  }

  analyze(): MetaTerritoryAnalysis {
    const allTerritories = [
      ...this.computeTerritoryFromDraws(this.historicalDraws.slice(0, 100)), // recent historical
      ...this.generationTerritories,
      ...this.sessionTerritories,
    ];

    const freqMap: Record<Dezena, number> = {};
    let totalCoverage = 0;
    for (const t of allTerritories) {
      for (const [dez, count] of Object.entries(t)) {
        freqMap[dez as Dezena] = (freqMap[dez as Dezena] || 0) + count;
        totalCoverage += count;
      }
    }

    // Pressure zones: high frequency
    const pressureZones: PressureZones = {
      zones: Object.entries(freqMap)
        .filter(([_, count]) => count > totalCoverage / 100 * 1.5) // above average
        .map(([dez, count]) => ({ dezena: Number(dez) as Dezena, pressure: count / (totalCoverage / 100) }))
        .sort((a, b) => b.pressure - a.pressure)
    };

    // Blind zones: low frequency
    const blindZones: BlindZones = {
      zones: Object.entries(freqMap)
        .filter(([_, count]) => count < totalCoverage / 100 * 0.5) // below average
        .map(([dez, count]) => ({ dezena: Number(dez) as Dezena, coverage: count / (totalCoverage / 100) }))
        .sort((a, b) => a.coverage - b.coverage)
    };

    // False diversity: check if diversity is high but coverage is skewed
    const overallDiversity = this.calculateDiversity(allTerritories);
    const actualCoverage = Object.keys(freqMap).length / 100;
    const falsePositive = overallDiversity > 0.7 && actualCoverage < 0.8;

    const falseDiversitySignals: FalseDiversitySignals = {
      overallDiversity,
      actualCoverage,
      falsePositive
    };

    // Territory drift: compare recent vs older
    const recent = this.sessionTerritories.slice(-5);
    const older = this.generationTerritories.slice(-10, -5);
    const driftMagnitude = this.computeDrift(recent, older);
    const direction = driftMagnitude > 0.1 ? 'exploring' : driftMagnitude < -0.1 ? 'converging' : 'stable';

    const territoryDrift: TerritoryDrift = {
      driftMagnitude,
      direction
    };

    return {
      pressureZones,
      blindZones,
      falseDiversitySignals,
      territoryDrift
    };
  }

  private computeTerritoryFromGames(games: { numbers: Dezena[] }[]): TerritoryMap {
    const map: TerritoryMap = {};
    for (const game of games) {
      for (const n of game.numbers) {
        map[n] = (map[n] || 0) + 1;
      }
    }
    return map;
  }

  private computeTerritoryFromDraws(draws: DrawRecord[]): TerritoryMap[] {
    return draws.map(d => {
      const map: TerritoryMap = {};
      for (const n of d.numbers) map[n] = (map[n] || 0) + 1;
      return map;
    });
  }

  private calculateDiversity(territories: TerritoryMap[]): number {
    if (territories.length === 0) return 0;
    const union = new Set<Dezena>();
    for (const t of territories) {
      for (const n in t) union.add(Number(n) as Dezena);
    }
    return union.size / 100;
  }

  private computeDrift(recent: TerritoryMap[], older: TerritoryMap[]): number {
    const recentFreq: Record<Dezena, number> = {};
    const olderFreq: Record<Dezena, number> = {};

    for (const t of recent) for (const [n, c] of Object.entries(t)) recentFreq[n as Dezena] = (recentFreq[n as Dezena] || 0) + c;
    for (const t of older) for (const [n, c] of Object.entries(t)) olderFreq[n as Dezena] = (olderFreq[n as Dezena] || 0) + c;

    let drift = 0;
    for (let n = 0; n <= 99; n++) {
      const r = recentFreq[n] || 0;
      const o = olderFreq[n] || 0;
      drift += Math.abs(r - o);
    }
    return drift / 100; // normalized
  }
}

export const metaTerritoryEngine = new MetaTerritoryEngine();