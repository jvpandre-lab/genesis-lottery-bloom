// Tactical Role Engine
// Atribui papéis táticos aos jogos no lote para composição funcional.
// Papéis: Anchor, Explorer, Breaker, Shield, Spreader, AntiCrowd.

import { Dezena, Game, BatchName, LineageId } from "./lotteryTypes";
import { TerritoryMap } from "./territoryEngine";
import { batchDiversity } from "./diversityEngine";

export type TacticalRole =
  | 'Anchor'      // Estabilidade estrutural, baixa variância
  | 'Explorer'    // Exploração territorial, alta novidade
  | 'Breaker'     // Ruptura de padrão dominante
  | 'Shield'      // Baixa redundância, proteção contra falhas
  | 'Spreader'    // Dispersão extrema
  | 'AntiCrowd';  // Anti-padrão humano

export interface TacticalGame extends Game {
  tacticalRole: TacticalRole;
  roleScore: number; // 0-1, quão bem cumpre o papel
}

export interface TacticalBatch {
  name: BatchName;
  games: TacticalGame[];
  composition: Record<TacticalRole, number>;
  balanceScore: number; // equilíbrio entre papéis
}

export interface TacticalLote {
  batches: TacticalBatch[];
  overallComposition: Record<TacticalRole, number>;
  tacticalBalance: number;
  functionalScore: number; // score + diversidade + equilíbrio
}

export class TacticalRoleEngine {
  private territoryHistory: TerritoryMap[] = [];
  private dominantPatterns: Set<string> = new Set(); // simplified pattern keys

  updateTerritoryHistory(territory: TerritoryMap) {
    this.territoryHistory.push(territory);
    if (this.territoryHistory.length > 20) this.territoryHistory = this.territoryHistory.slice(-20);
  }

  updateDominantPatterns(patterns: string[]) {
    this.dominantPatterns = new Set(patterns.slice(-10));
  }

  assignRoles(games: Game[], territory: TerritoryMap): TacticalGame[] {
    return games.map(game => {
      const role = this.determineRole(game, territory);
      const roleScore = this.calculateRoleScore(game, role, territory);
      return { ...game, tacticalRole: role, roleScore };
    });
  }

  buildTacticalLote(batches: { name: BatchName; games: Game[] }[], territory: TerritoryMap): TacticalLote {
    const tacticalBatches: TacticalBatch[] = batches.map(b => {
      const tacticalGames = this.assignRoles(b.games, territory);
      const composition: Record<TacticalRole, number> = {
        Anchor: 0, Explorer: 0, Breaker: 0, Shield: 0, Spreader: 0, AntiCrowd: 0
      };
      for (const g of tacticalGames) composition[g.tacticalRole]++;
      const balanceScore = this.calculateBalance(composition, b.games.length);
      return { name: b.name, games: tacticalGames, composition, balanceScore };
    });

    const overallComposition: Record<TacticalRole, number> = {
      Anchor: 0, Explorer: 0, Breaker: 0, Shield: 0, Spreader: 0, AntiCrowd: 0
    };
    let totalGames = 0;
    for (const b of tacticalBatches) {
      for (const [role, count] of Object.entries(b.composition)) {
        overallComposition[role as TacticalRole] += count;
      }
      totalGames += b.games.length;
    }

    const tacticalBalance = this.calculateBalance(overallComposition, totalGames);
    const functionalScore = this.calculateFunctionalScore(tacticalBatches, territory);

    return {
      batches: tacticalBatches,
      overallComposition,
      tacticalBalance,
      functionalScore
    };
  }

  private determineRole(game: Game, territory: TerritoryMap): TacticalRole {
    const numbers = game.numbers;
    const entropy = this.calculateEntropy(numbers);
    const novelty = this.calculateNovelty(numbers, territory);
    const patternKey = this.getPatternKey(numbers);
    const isAntiCrowd = this.isAntiCrowdPattern(numbers);

    if (entropy < 0.3) return 'Anchor'; // low entropy = stable
    if (novelty > 0.8) return 'Explorer'; // high novelty
    if (this.dominantPatterns.has(patternKey)) return 'Breaker'; // breaks dominant
    if (this.calculateRedundancy(numbers, territory) < 0.2) return 'Shield'; // low redundancy
    if (entropy > 0.8) return 'Spreader'; // high dispersion
    if (isAntiCrowd) return 'AntiCrowd';
    return 'Anchor'; // default
  }

  private calculateRoleScore(game: Game, role: TacticalRole, territory: TerritoryMap): number {
    const numbers = game.numbers;
    switch (role) {
      case 'Anchor': return 1 - this.calculateEntropy(numbers); // lower entropy better
      case 'Explorer': return this.calculateNovelty(numbers, territory);
      case 'Breaker': return this.dominantPatterns.has(this.getPatternKey(numbers)) ? 1 : 0;
      case 'Shield': return 1 - this.calculateRedundancy(numbers, territory);
      case 'Spreader': return this.calculateEntropy(numbers);
      case 'AntiCrowd': return this.isAntiCrowdPattern(numbers) ? 1 : 0;
      default: return 0;
    }
  }

  private calculateBalance(composition: Record<TacticalRole, number>, total: number): number {
    if (total === 0) return 0;
    const ideal = total / 6; // equal distribution
    let balance = 0;
    let nonZeroRoles = 0;
    for (const count of Object.values(composition)) {
      if (count > 0) nonZeroRoles++;
      balance += 1 - Math.abs(count - ideal) / Math.max(1, ideal);
    }
    // normalize to 0-1 range considering how many roles are represented
    return Math.min(1, Math.max(0, (balance / 6) * (nonZeroRoles / 6)));
  }

  private calculateFunctionalScore(batches: TacticalBatch[], territory: TerritoryMap): number {
    let score = 0;
    let count = 0;
    for (const b of batches) {
      score += b.balanceScore;
      // batchDiversity expects array of objects with .numbers property
      score += batchDiversity(b.games.map(g => ({ numbers: g.numbers })));
      score += b.games.reduce((s, g) => s + g.score.total, 0) / b.games.length;
      count++;
    }
    return count > 0 ? score / (count * 3) : 0;
  }

  private calculateEntropy(numbers: Dezena[]): number {
    // Simple entropy based on distribution
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

  private calculateNovelty(numbers: Dezena[], territory: TerritoryMap): number {
    let novelty = 0;
    for (const n of numbers) {
      novelty += (territory[n] || 0) === 0 ? 1 : 0;
    }
    return novelty / 50;
  }

  private calculateRedundancy(numbers: Dezena[], territory: TerritoryMap): number {
    let redundancy = 0;
    for (const n of numbers) {
      redundancy += territory[n] || 0;
    }
    return redundancy / 50;
  }

  private getPatternKey(numbers: Dezena[]): string {
    // Simplified: sort and join
    return numbers.slice().sort((a, b) => a - b).join(',');
  }

  private isAntiCrowdPattern(numbers: Dezena[]): boolean {
    // Simple: avoid common human patterns like sequences
    for (let i = 0; i < numbers.length - 2; i++) {
      if (numbers[i + 1] === numbers[i] + 1 && numbers[i + 2] === numbers[i] + 2) return false; // sequence
    }
    return true;
  }
}

export const tacticalRoleEngine = new TacticalRoleEngine();