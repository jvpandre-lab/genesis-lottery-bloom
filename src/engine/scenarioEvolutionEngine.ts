// Scenario Evolution Engine
// Sistema vivo que aprende quando trocar perfil estratégico automaticamente.

import { Scenario } from "./lotteryTypes";
import { CycleHealth } from "./cycleMemoryEngine";
import { TerritoryDrift } from "./metaTerritoryEngine";
import { persistScenarioTransition } from "@/services/storageService";

export interface ScenarioTransition {
  from: Scenario;
  to: Scenario;
  reason: string;
  triggeredBy: any;
}

export class ScenarioEvolutionEngine {
  private currentScenario: Scenario = 'hybrid';
  private transitionHistory: ScenarioTransition[] = [];

  evaluateTransition(cycleHealth: CycleHealth, territoryDrift: TerritoryDrift, currentScenario: Scenario): Scenario | null {
    if (cycleHealth.recoveryNeed && currentScenario !== 'recovery') {
      return this.transitionTo('recovery', 'Saúde do ciclo baixa - necessidade de recuperação', { cycleHealth });
    }
    if (territoryDrift.driftMagnitude > 0.5 && territoryDrift.direction === 'converging' && currentScenario !== 'exploratory') {
      return this.transitionTo('exploratory', 'Drift territorial convergente detectado - forçar exploração', { territoryDrift });
    }
    if (cycleHealth.fatigueLevel > 0.8 && currentScenario !== 'conservative') {
      return this.transitionTo('conservative', 'Fadiga alta - reduzir para conservador', { cycleHealth });
    }
    if (territoryDrift.driftMagnitude < 0.1 && currentScenario !== 'aggressive') {
      return this.transitionTo('aggressive', 'Estabilidade territorial - aumentar agressividade', { territoryDrift });
    }
    return null;
  }

  async applyTransition(newScenario: Scenario) {
    const transition: ScenarioTransition = {
      from: this.currentScenario,
      to: newScenario,
      reason: this.transitionHistory[this.transitionHistory.length - 1]?.reason || 'Manual',
      triggeredBy: {}
    };
    this.currentScenario = newScenario;
    this.transitionHistory.push(transition);
    await persistScenarioTransition(transition.from, transition.to, transition.reason, transition.triggeredBy);
  }

  getCurrentScenario(): Scenario {
    return this.currentScenario;
  }

  getTransitionHistory(): ScenarioTransition[] {
    return this.transitionHistory.slice();
  }

  private transitionTo(scenario: Scenario, reason: string, triggeredBy: any): Scenario {
    this.transitionHistory.push({ from: this.currentScenario, to: scenario, reason, triggeredBy });
    return scenario;
  }
}

export const scenarioEvolutionEngine = new ScenarioEvolutionEngine();