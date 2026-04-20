// Recommendation Engine
// Gera recomendações textuais reais baseadas no estado dos motores.

import { GenerationResult, LineageId } from "./lotteryTypes";
import { BacktestReport } from "./backtestEngine";
import { PressureSignals, AdaptiveAdjustments } from "./adaptivePressureEngine";

export interface Recommendation {
  level: "info" | "warn" | "critical";
  title: string;
  detail: string;
}

export function recommend(
  result: GenerationResult,
  signals: PressureSignals,
  adjustments: AdaptiveAdjustments,
  backtest?: BacktestReport,
): Recommendation[] {
  const out: Recommendation[] = [];

  if (result.metrics.avgDiversity < 0.5) {
    out.push({ level: "warn", title: "Diversidade baixa no lote atual",
      detail: `Diversidade média ${(result.metrics.avgDiversity*100).toFixed(0)}% — considere cenário Exploratório ou Agressivo.` });
  }
  if (result.metrics.territoryEntropy < 0.93) {
    out.push({ level: "warn", title: "Entropia territorial caindo",
      detail: `Entropia ${(result.metrics.territoryEntropy*100).toFixed(1)}% — território está concentrando. Pressão adaptativa reforçará dispersão.` });
  }
  if (result.metrics.avgScore < 0.55) {
    out.push({ level: "critical", title: "Score médio abaixo do limiar saudável",
      detail: `Score ${(result.metrics.avgScore*100).toFixed(0)}/100. Verifique se o histórico carregado está coerente.` });
  }
  if (signals.lineageDominance) {
    out.push({ level: "info", title: `Linhagem ${signals.lineageDominance} dominou últimas gerações`,
      detail: `Sistema reduzirá automaticamente o peso desta linhagem na próxima geração.` });
  }
  if (signals.patternRepetition) {
    out.push({ level: "warn", title: "Padrão de scores repetitivo",
      detail: "Variância de score estagnada — anti-multidão será reforçada." });
  }
  if (adjustments.reasons.length > 0) {
    out.push({ level: "info", title: "Pressão adaptativa ativada",
      detail: adjustments.reasons.join(" ") });
  }
  if (backtest && backtest.drawsAvailable >= 50 && backtest.windows.length > 0) {
    const w50 = backtest.windows[0];
    out.push({ level: "info", title: `Backtest ${w50.windowSize} concursos`,
      detail: `Média de acertos ${w50.avgHits.toFixed(2)} | freq 15+ ${(w50.freq15plus*100).toFixed(2)}% | freq 16+ ${(w50.freq16plus*100).toFixed(3)}%.` });
    if (backtest.perLineage.length > 0) {
      const top = backtest.perLineage[0];
      out.push({ level: "info", title: `Melhor linhagem no histórico: ${top.lineage}`,
        detail: `Média ${top.avgHits.toFixed(2)} acertos sobre ${top.games} jogos avaliados.` });
    }
    if (backtest.perBatch.length > 0) {
      const top = backtest.perBatch[0];
      out.push({ level: "info", title: `Melhor lote no histórico: ${top.batch}`,
        detail: `Média ${top.avgHits.toFixed(2)} acertos.` });
    }
  } else if (!backtest || backtest.drawsAvailable === 0) {
    out.push({ level: "warn", title: "Sem histórico para backtest",
      detail: "Importe um CSV/JSON com concursos passados para ativar avaliação histórica e anti-viés realista." });
  }
  return out;
}
