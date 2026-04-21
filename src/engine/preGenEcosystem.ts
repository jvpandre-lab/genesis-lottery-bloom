// Pre-Generation Ecosystem — P5 FIX
// Lê o estado de todos os engines do ecossistema ANTES da geração
// e produz um PreGenContext que influencia geração, seleção e arbitragem.

import { Dezena, DrawRecord, GenerationResult, LineageId, Scenario, BatchName } from "./lotteryTypes";
import { metaTerritoryEngine } from "./metaTerritoryEngine";
import { cycleMemoryEngine } from "./cycleMemoryEngine";
import { brainTensionEngine } from "./brainTensionEngine";
import { scenarioEvolutionEngine } from "./scenarioEvolutionEngine";
import { lineageDriftEngine } from "./lineageDriftEngine";
import { TacticalRole } from "./tacticalRoleEngine";

/**
 * Contexto pré-geração produzido pelo ecossistema.
 * Influencia: pesos territoriais, cenário, targetBalance, mutationRate,
 * linhagens penalizadas, papéis táticos necessários por lote.
 */
export interface PreGenContext {
    /** Dezenas saturadas: peso reduzido nos geradores [0..99]. */
    weightModifiers: number[];
    /** Cenário escolhido pelo ScenarioEvolutionEngine (ou null para usar o do usuário). */
    scenarioOverride: Scenario | null;
    /** Ajuste no targetBalanceA do árbitro. -0.2..+0.2 */
    targetBalanceAdjustment: number;
    /** Ajuste na taxa de mutação base. -0.05..+0.15 */
    mutationRateModifier: number;
    /** Linhagens em drift — recebem penalidade de score. */
    lineagePenalties: Partial<Record<LineageId, number>>;
    /** Papéis táticos que ainda faltam no lote (por batch). */
    tacticalNeeds: Partial<Record<BatchName, TacticalRole[]>>;
    /** Razões do contexto pré-gen (para diagnóstico). */
    reasons: string[];
    /** True se o ecossistema tem dados suficientes para influenciar. */
    hasData: boolean;
}

/**
 * Constrói o PreGenContext lendo o estado atual de todos os engines
 * antes de iniciar a geração.
 */
export function buildPreGenContext(
    recentResults: GenerationResult[],
    allDraws: DrawRecord[],
    scenario: Scenario,
): PreGenContext {
    const DOMAIN = 100;
    const weightModifiers = new Array(DOMAIN).fill(1.0);
    const reasons: string[] = [];
    let scenarioOverride: Scenario | null = null;
    let targetBalanceAdjustment = 0;
    let mutationRateModifier = 0;
    const lineagePenalties: Partial<Record<LineageId, number>> = {};
    const tacticalNeeds: Partial<Record<BatchName, TacticalRole[]>> = {};

    if (recentResults.length === 0) {
        return {
            weightModifiers,
            scenarioOverride: null,
            targetBalanceAdjustment: 0,
            mutationRateModifier: 0,
            lineagePenalties: {},
            tacticalNeeds: {},
            reasons: ["Sem histórico de gerações — contexto neutro."],
            hasData: false,
        };
    }

    // ── 1. MetaTerritoryEngine → pesos por dezena ──────────────────────────
    try {
        metaTerritoryEngine.updateHistoricalDraws(allDraws);
        for (const r of recentResults.slice(-5)) metaTerritoryEngine.observeGeneration(r);
        const analysis = metaTerritoryEngine.analyze();

        // Zona saturada: reduzir peso
        for (const z of analysis.pressureZones.zones) {
            const idx = z.dezena as number;
            if (idx >= 0 && idx < DOMAIN) {
                weightModifiers[idx] = Math.max(0.1, 1 / Math.sqrt(z.pressure));
            }
        }
        if (analysis.pressureZones.zones.length > 0) {
            reasons.push(`MetaTerritory: ${analysis.pressureZones.zones.length} zonas saturadas bloqueadas.`);
        }

        // Zona cega: reforçar peso
        for (const z of analysis.blindZones.zones) {
            const idx = z.dezena as number;
            if (idx >= 0 && idx < DOMAIN) {
                weightModifiers[idx] = Math.min(3.5, 1 / Math.max(0.05, z.coverage));
            }
        }
        if (analysis.blindZones.zones.length > 0) {
            reasons.push(`MetaTerritory: ${analysis.blindZones.zones.length} blind zones reforçadas.`);
        }

        // False diversity: forçar exploração
        if (analysis.falseDiversitySignals.falsePositive) {
            mutationRateModifier += 0.05;
            reasons.push("MetaTerritory: falsa diversidade detectada — aumentando mutação.");
        }

        // Drift territorial convergente: forçar exploração
        if (analysis.territoryDrift.direction === "converging" && analysis.territoryDrift.driftMagnitude > 0.15) {
            scenarioOverride = "exploratory";
            mutationRateModifier += 0.04;
            reasons.push("MetaTerritory: drift convergente → cenário forçado para exploratory.");
        }
    } catch (e) {
        reasons.push("MetaTerritory: erro ao analisar (usando pesos neutros).");
    }

    // ── 2. CycleMemoryEngine → fadiga, mutação ─────────────────────────────
    try {
        for (const r of recentResults.slice(-5)) cycleMemoryEngine.observeGeneration(r, scenario);
        const health = cycleMemoryEngine.getCycleHealth("last5");

        if (health.recoveryNeed) {
            mutationRateModifier += 0.08;
            targetBalanceAdjustment += 0.15; // favorecer Brain A (estabilidade)
            reasons.push(`CycleMemory: saúde baixa (${health.healthScore.toFixed(2)}) — mutação+, favorecer Brain A.`);
        }
        if (health.fatigueLevel > 0.7) {
            mutationRateModifier += 0.06;
            reasons.push(`CycleMemory: fadiga alta (${health.fatigueLevel.toFixed(2)}) — aumentando variação.`);
        }
        if (health.instability > 0.4) {
            targetBalanceAdjustment += 0.10; // estabilizar
            reasons.push(`CycleMemory: instabilidade alta (${health.instability.toFixed(2)}) — favorecer Brain A.`);
        }
    } catch (e) {
        reasons.push("CycleMemory: erro ao calcular health.");
    }

    // ── 3. BrainTensionEngine → ajuste de balance ──────────────────────────
    try {
        const tensionReport = brainTensionEngine.getHealthReport();
        if (tensionReport.brainBStrength > 0.72) {
            // Brain B capturando demais → endurecer árbitro a favor de A
            targetBalanceAdjustment += 0.12;
            reasons.push(`BrainTension: Brain B muito dominante (${tensionReport.brainBStrength.toFixed(2)}) — árbitro endurecido.`);
        }
        if (tensionReport.brainAStrength > 0.80) {
            // Brain A rígido demais → abrir espaço para B
            targetBalanceAdjustment -= 0.10;
            reasons.push(`BrainTension: Brain A rígido demais (${tensionReport.brainAStrength.toFixed(2)}) — abrindo espaço para B.`);
        }
    } catch (e) {
        reasons.push("BrainTension: sem dados suficientes.");
    }

    // ── 4. ScenarioEvolutionEngine → cenário automático ────────────────────
    try {
        // Apenas usa o cenário do ecosistema se não foi sobreposto pelo metaTerritory
        if (!scenarioOverride) {
            const ecoScenario = scenarioEvolutionEngine.getCurrentScenario();
            if (ecoScenario !== scenario) {
                scenarioOverride = ecoScenario;
                reasons.push(`ScenarioEvolution: cenário automático → ${ecoScenario} (era ${scenario}).`);
            }
        }
    } catch (e) {
        reasons.push("ScenarioEvolution: sem dados suficientes.");
    }

    // ── 5. LineageDriftEngine → penalidades de linhagem ────────────────────
    try {
        for (const r of recentResults.slice(-5)) lineageDriftEngine.recordLineageBehavior(r);
        const drifts = lineageDriftEngine.getAllDrifts();
        for (const d of drifts) {
            if (d.status === "drifting") {
                lineagePenalties[d.lineage] = 0.85; // 15% de penalidade no score
                reasons.push(`LineageDrift: ${d.lineage} em drift — penalidade 15%.`);
            } else if (d.status === "lost") {
                lineagePenalties[d.lineage] = 0.65; // 35% de penalidade
                reasons.push(`LineageDrift: ${d.lineage} perdeu identidade — penalidade 35%.`);
            }
        }
    } catch (e) {
        reasons.push("LineageDrift: erro ao detectar drifts.");
    }

    // ── 6. TacticalNeeds → papéis táticos que faltam ───────────────────────
    // Por ora: esqueleto padrão. O tacticalRoleEngine popula durante montagem do lote.
    // (preenchido incrementalmente no generatorCore durante seleção de jogos)

    // Clampar ajustes
    targetBalanceAdjustment = Math.max(-0.25, Math.min(0.25, targetBalanceAdjustment));
    mutationRateModifier = Math.max(-0.05, Math.min(0.15, mutationRateModifier));

    return {
        weightModifiers,
        scenarioOverride,
        targetBalanceAdjustment,
        mutationRateModifier,
        lineagePenalties,
        tacticalNeeds,
        reasons,
        hasData: true,
    };
}
