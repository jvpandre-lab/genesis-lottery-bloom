// Domínio Lotomania — tipos centrais
// dezenas: 00–99 (50 por jogo, 20 sorteadas oficialmente)

export const DOMAIN_MIN = 0;
export const DOMAIN_MAX = 99;
export const DOMAIN_SIZE = 100;
export const GAME_SIZE = 50;       // dezenas marcadas por aposta
export const DRAWN_SIZE = 20;      // dezenas sorteadas oficialmente

export type Dezena = number; // 0..99

export const formatDezena = (n: Dezena): string => n.toString().padStart(2, "0");

export type LineageId =
  | "conservative"
  | "dispersive"
  | "coverage"
  | "anticrowd"
  | "hybrid"
  | "chaotic";

export interface LineageMeta {
  id: LineageId;
  name: string;
  short: string;
  description: string;
  color: string; // tailwind token
}

export const LINEAGES: Record<LineageId, LineageMeta> = {
  conservative: { id: "conservative", name: "Conservadora Estrutural", short: "CON", description: "Distribuição equilibrada, baixa volatilidade estrutural.", color: "lineage-conservative" },
  dispersive: { id: "dispersive", name: "Dispersiva Extrema", short: "DSP", description: "Maximiza espaçamento e dispersão entre dezenas.", color: "lineage-dispersive" },
  coverage: { id: "coverage", name: "Cobertura Massiva", short: "COV", description: "Otimiza ocupação por faixas e regiões do espaço.", color: "lineage-coverage" },
  anticrowd: { id: "anticrowd", name: "Anti-Multidão", short: "ANT", description: "Evita padrões humanos previsíveis e simétricos.", color: "lineage-anticrowd" },
  hybrid: { id: "hybrid", name: "Híbrida Adaptativa", short: "HYB", description: "Combina cobertura, dispersão e anti-viés.", color: "lineage-hybrid" },
  chaotic: { id: "chaotic", name: "Caótica Controlada", short: "CHA", description: "Alta entropia controlada, exploração agressiva.", color: "lineage-chaotic" },
};

export type BatchName = "Alpha" | "Sigma" | "Delta" | "Omega";

export interface BatchMeta {
  name: BatchName;
  purpose: string;
  description: string;
  dominant: LineageId;
  mix: LineageId[];
  color: string;
}

export const BATCHES: Record<BatchName, BatchMeta> = {
  Alpha: { name: "Alpha", purpose: "Estabilidade", description: "Estrutura sólida, baixa variância.", dominant: "conservative", mix: ["conservative", "coverage", "hybrid"], color: "batch-alpha" },
  Sigma: { name: "Sigma", purpose: "Dispersão", description: "Espaçamento e diversidade ampliados.", dominant: "dispersive", mix: ["dispersive", "coverage", "anticrowd"], color: "batch-sigma" },
  Delta: { name: "Delta", purpose: "Ruptura", description: "Quebra de padrões e anti-viés humano.", dominant: "anticrowd", mix: ["anticrowd", "chaotic", "hybrid"], color: "batch-delta" },
  Omega: { name: "Omega", purpose: "Exploração extrema", description: "Caos controlado em zonas pouco usadas.", dominant: "chaotic", mix: ["chaotic", "dispersive", "anticrowd"], color: "batch-omega" },
};

export type Scenario = "conservative" | "hybrid" | "aggressive" | "exploratory";

export interface ScoreBreakdown {
  coverage: number;       // 0..1
  distribution: number;   // 0..1
  diversity: number;      // 0..1 (vs outros jogos do lote)
  territory: number;      // 0..1 (exploração de zonas pouco usadas)
  antiBias: number;       // 0..1 (penaliza padrões humanos)
  clusterPenalty: number; // 0..1 (1 = nenhum cluster)
  total: number;          // ponderada 0..1
}

export interface GameMetrics {
  evenCount: number;
  oddCount: number;
  primeCount: number;
  sumTotal: number;
  meanGap: number;
  maxGap: number;
  consecutivePairs: number;
  decadeCounts: number[]; // 10 valores (00-09 .. 90-99)
  rowCounts: number[];    // 10 valores (volante 10x10 — linhas)
  colCounts: number[];    // 10 valores (volante 10x10 — colunas)
}

export interface Game {
  numbers: Dezena[]; // ordenado, length GAME_SIZE
  lineage: LineageId;
  score: ScoreBreakdown;
  metrics: GameMetrics;
}

export interface Batch {
  name: BatchName;
  purpose: string;
  dominant: LineageId;
  games: Game[];
  avgScore: number;
  diversity: number; // 0..1 média intra-lote
}

export interface GenerationResult {
  id?: string;
  label: string;
  scenario: Scenario;
  requestedCount: number;
  batches: Batch[];
  metrics: {
    avgScore: number;
    avgDiversity: number;
    avgCoverage: number;
    territoryEntropy: number;
  };
  createdAt: string;
}

export interface DrawRecord {
  contestNumber: number;
  drawDate?: string;
  numbers: Dezena[] | string[]; // Suporte explícito para numérico e formato "00" normalizado
  createdAt?: string;
}
