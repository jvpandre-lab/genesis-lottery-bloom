// Integration: Complete ecosystem flow with all new engines

import { GenerationResult, DrawRecord } from "./lotteryTypes";
import { metaTerritoryEngine } from "./metaTerritoryEngine";
import { tacticalRoleEngine } from "./tacticalRoleEngine";
import { cycleMemoryEngine } from "./cycleMemoryEngine";
import { scenarioEvolutionEngine } from "./scenarioEvolutionEngine";
import { lineageDriftEngine } from "./lineageDriftEngine";
import { brainTensionEngine } from "./brainTensionEngine";
import { globalPressure } from "./adaptivePressureEngine";
import {
  persistPressureSignals,
  persistAdjustments,
  persistLineageHistory,
  persistTerritorySnapshot,
  PressureSignal,
  AdjustmentRecord,
  LineageRecord,
  TerritorySnapshot
} from "@/services/storageService";

export async function integrateEcosystemFlow(
  result: GenerationResult,
  allDraws: DrawRecord[],
  generationId: string,
  divergence: number,
  arbitrationDifficulty: number
) {
  // 1. Update meta-territory
  metaTerritoryEngine.updateHistoricalDraws(allDraws);
  metaTerritoryEngine.observeGeneration(result);
  const territoryAnalysis = metaTerritoryEngine.analyze();

  // 2. Observe pressure signals
  globalPressure.observe(result);
  const signals = globalPressure.signals();
  const adjustments = globalPressure.computeAdjustments(result.scenario);

  // 3. Assign tactical roles
  const games = result.batches.flatMap(b => b.games);
  const territoryMap: any = {};
  for (const game of games) {
    for (const n of game.numbers) territoryMap[n] = (territoryMap[n] || 0) + 1;
  }
  const tacticalGames = tacticalRoleEngine.assignRoles(games, territoryMap);

  // 4. Record cycle memory
  cycleMemoryEngine.observeGeneration(result, result.scenario);
  const cycleHealth = cycleMemoryEngine.getCycleHealth('last5');

  // 5. Check scenario evolution
  let newScenario = result.scenario;
  if (cycleHealth && territoryAnalysis) {
    const evolved = scenarioEvolutionEngine.evaluateTransition(
      cycleHealth,
      territoryAnalysis.territoryDrift,
      result.scenario
    );
    if (evolved && evolved !== result.scenario) {
      newScenario = evolved;
      await scenarioEvolutionEngine.applyTransition(newScenario);
    }
  }

  // 6. Record lineage drift
  lineageDriftEngine.recordLineageBehavior(result);
  const drifts = lineageDriftEngine.getAllDrifts();

  // 7. Record brain tension
  brainTensionEngine.recordGeneration(result, divergence, arbitrationDifficulty);

  // 8. Persist to database
  const pressureSignals: PressureSignal[] = [
    { signalType: 'low_diversity', value: signals.lowDiversity ? 1 : 0, triggered: signals.lowDiversity },
    { signalType: 'saturated_territory', value: signals.saturatedTerritory ? 1 : 0, triggered: signals.saturatedTerritory },
    { signalType: 'score_stagnation', value: signals.scoreStagnation ? 1 : 0, triggered: signals.scoreStagnation },
    { signalType: 'pattern_repetition', value: signals.patternRepetition ? 1 : 0, triggered: signals.patternRepetition }
  ];
  if (signals.lineageDominance) {
    pressureSignals.push({
      signalType: 'lineage_dominance',
      value: 1,
      triggered: true
    });
  }

  const adjustmentRecords: AdjustmentRecord[] = adjustments.reasons.map(reason => ({
    adjustmentType: 'pressure_adjustment',
    details: { reason, adjustments },
    applied: true
  }));

  const lineageRecords: LineageRecord[] = Object.entries(result.batches.flatMap(b => b.games).reduce((acc: any, g) => {
    acc[g.lineage] = (acc[g.lineage] || 0) + 1;
    return acc;
  }, {})).map(([lineage, count]: any) => ({
    lineage: lineage as any,
    dominanceScore: count / games.length,
  }));

  const territorySnapshot: TerritorySnapshot = {
    snapshot: territoryMap,
    saturationLevel: 1 - result.metrics.territoryEntropy
  };

  try {
    await persistPressureSignals(generationId, pressureSignals);
    await persistAdjustments(generationId, adjustmentRecords);
    await persistLineageHistory(generationId, lineageRecords);
    await persistTerritorySnapshot(generationId, territorySnapshot);
  } catch (e) {
    console.error('Failed to persist ecosystem data:', e);
  }

  return {
    territoryAnalysis,
    cycleHealth,
    drifts,
    scenarioEvolution: { from: result.scenario, to: newScenario },
    tacticalComposition: tacticalRoleEngine.buildTacticalLote(
      result.batches.map(b => ({ name: b.name, games: b.games })),
      territoryMap
    ),
    brainTension: brainTensionEngine.getHealthReport()
  };
}