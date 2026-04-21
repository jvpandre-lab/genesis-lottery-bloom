import { Dezena, DrawRecord } from "@/engine/lotteryTypes";
import { fetchRecentDraws, upsertDraws } from "./storageService";

export interface ImportReport {
  totalRead: number;
  totalValid: number;
  totalDiscarded: number;
  discardReasons: Record<string, number>;
}

export interface SyncReport {
  status: "success" | "fallback_banco" | "erro_total";
  newRecordsAdded: number;
  recordsIgnoredDuplicate: number;
  error?: string;
  lastSuccessfulSyncAt?: string;
}

// Global in-memory cache for status (could be persisted to LocalStorage if needed)
let globalLastSuccessfulSync: string | null = null;

const CAIXA_API_URL = "https://loteriascaixa-api.herokuapp.com/api/lotomania";

/**
 * Validação Nuclear (Domínio Lotomania) - Como estritamente solicitado
 * Exige EXATAMENTE 50 números, domínio 00..99, garantindo unicidade.
 */
export function validateDraw(rawNums: any[] | string): string[] | { error: string } {
  let numsArr: any[];

  if (Array.isArray(rawNums)) {
    numsArr = rawNums;
  } else {
    numsArr = String(rawNums).split(/[,\s;|-]+/);
  }

  const parsed = numsArr
    .map(n => {
      const numStr = String(n).trim();
      const numVal = Number(numStr);
      if (Number.isFinite(numVal) && numVal >= 0 && numVal <= 99) {
        return numVal.toString().padStart(2, "0");
      }
      return null;
    })
    .filter((n): n is string => n !== null);

  if (parsed.length !== 50) {
    return { error: `invalid_length_expected_50_got_${parsed.length}` };
  }

  // Garantir unicidade sem bagunçar a ordem de forma que cause problemas 
  // (mas set tira as duplicatas, logo se cair length falha embaixo)
  const unique = Array.from(new Set(parsed)).sort((a, b) => Number(a) - Number(b));

  if (unique.length !== 50) {
    return { error: "duplicate_numbers" };
  }

  return unique;
}

/**
 * Busca histórico automaticamente via API oficial (Defensiva)
 */
async function fetchDrawsFromAPIWithRetry(retries = 2, timeoutMs = 8000): Promise<any[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(CAIXA_API_URL, { signal: controller.signal });
      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("API não retornou um array.");
      return data;
    } catch (e: any) {
      clearTimeout(id);
      console.warn(`[API] Tentativa ${attempt} falhou: ${e.message}`);
      if (attempt === retries) {
        throw new Error("Todas as tentativas de fetch falharam.");
      }
    }
  }
  return [];
}

/**
 * Sincronizador Híbrido: API → Banco Onde Faltar (Incremental)
 */
export async function syncDraws(): Promise<SyncReport> {
  const report: SyncReport = {
    status: "erro_total",
    newRecordsAdded: 0,
    recordsIgnoredDuplicate: 0
  };

  try {
    // Passo 1: O que temos no banco? Identificar o mais recente.
    const fromDb = await fetchRecentDraws(1);
    const lastContestNumber = fromDb.length > 0 ? fromDb[0].contestNumber : 0;

    // Passo 2: Buscar da API com retry e timeout
    let apiData: any[];
    try {
      apiData = await fetchDrawsFromAPIWithRetry(2, 8000);
    } catch (e: any) {
      // Fallback pro banco!
      report.status = "fallback_banco";
      report.error = "API offline ou timeout, usando dados do cache local.";
      if (globalLastSuccessfulSync) report.lastSuccessfulSyncAt = globalLastSuccessfulSync;
      return report;
    }

    // Passo 3: Normalizar e extrair incrementais
    const toInsert: DrawRecord[] = [];
    const timestamp = new Date().toISOString();

    for (const item of apiData) {
      const contest = Number(item.concurso ?? item.contestNumber);
      if (!contest || contest <= lastContestNumber) {
        continue; // Ignora os que já temos ou lixos sem concurso (Incremental)
      }

      const rawNums = item.dezenas ?? item.numbers;
      const valid = validateDraw(rawNums);

      if ("error" in valid) {
        // Registro ignorado silenciosamente no loop de upsert, mas entra na logica manual se quisermos
        report.recordsIgnoredDuplicate++; // Usando essa flag genérica ou podemos criar uma discarded API count
      } else {
        toInsert.push({
          contestNumber: contest,
          drawDate: item.data ? normalizeDate(item.data) : undefined,
          numbers: valid, // string[]
          source: "api",
          syncedAt: timestamp,
          lastCheckedAt: timestamp
        });
      }
    }

    if (toInsert.length > 0) {
      // Upsert defensivo (ignoreDuplicates ativado no Service para proteger histórico)
      const added = await upsertDraws(toInsert);
      report.newRecordsAdded = added;
      // os que n foram adicionados do lote toInsert, foram ignorados
      report.recordsIgnoredDuplicate += (toInsert.length - added);
    }

    globalLastSuccessfulSync = timestamp;
    report.status = "success";
    report.lastSuccessfulSyncAt = timestamp;
    return report;

  } catch (err: any) {
    report.status = "erro_total";
    report.error = err.message;
    return report;
  }
}

/**
 * PARSERS DE FALLBACK MANUAL
 */
export function parseDrawsFile(content: string, filename: string): DrawRecord[] | { draws: DrawRecord[], report: ImportReport } {
  const trimmed = content.trim();
  if (!trimmed) return { draws: [], report: { totalRead: 0, totalValid: 0, totalDiscarded: 0, discardReasons: {} } };
  if (filename.toLowerCase().endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseJSON(trimmed);
  }
  return parseCSV(trimmed);
}

function parseJSON(content: string): { draws: DrawRecord[], report: ImportReport } {
  const report: ImportReport = { totalRead: 0, totalValid: 0, totalDiscarded: 0, discardReasons: {} };
  const data = JSON.parse(content);
  const arr = Array.isArray(data) ? data : Array.isArray((data as any).results) ? (data as any).results : [];
  report.totalRead = arr.length;
  const out: DrawRecord[] = [];

  const timestamp = new Date().toISOString();

  for (const item of arr) {
    const contest = Number(item.contestNumber ?? item.contest_number ?? item.concurso ?? item.numero ?? item.number);
    const drawDate = item.drawDate ?? item.draw_date ?? item.data ?? item.date;
    const rawNums = item.numbers ?? item.dezenas ?? item.dezenasSorteadas ?? item.dezenas_sorteadas;

    if (!contest || !rawNums || !Number.isFinite(contest) || contest < 1) {
      report.discardReasons["invalid_contest_data"] = (report.discardReasons["invalid_contest_data"] || 0) + 1;
      report.totalDiscarded++;
      continue;
    }

    const valid = validateDraw(rawNums);
    if ("error" in valid) {
      report.discardReasons[valid.error] = (report.discardReasons[valid.error] || 0) + 1;
      report.totalDiscarded++;
      continue;
    }

    out.push({
      contestNumber: contest,
      drawDate: typeof drawDate === "string" ? drawDate.slice(0, 10) : undefined,
      numbers: valid,
      source: "manual",
      syncedAt: timestamp,
      lastCheckedAt: timestamp
    });
    report.totalValid++;
  }
  return { draws: out, report };
}

function parseCSV(content: string): { draws: DrawRecord[], report: ImportReport } {
  const report: ImportReport = { totalRead: 0, totalValid: 0, totalDiscarded: 0, discardReasons: {} };
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  report.totalRead = lines.length;
  const out: DrawRecord[] = [];
  const timestamp = new Date().toISOString();

  let start = 0;
  if (/[a-zA-Z]/.test(lines[0])) start = 1;

  for (let i = start; i < lines.length; i++) {
    const cells = lines[i].split(/[,;\t]/).map((s) => s.trim()).filter(Boolean);
    if (cells.length < 5) {
      report.discardReasons["insufficient_columns"] = (report.discardReasons["insufficient_columns"] || 0) + 1;
      report.totalDiscarded++;
      continue;
    }
    const contest = Number(cells[0]);
    if (!Number.isFinite(contest) || contest < 1) {
      report.discardReasons["invalid_contest_number"] = (report.discardReasons["invalid_contest_number"] || 0) + 1;
      report.totalDiscarded++;
      continue;
    }
    let drawDate: string | undefined;
    let numStart = 1;
    if (/^\d{4}-\d{2}-\d{2}$/.test(cells[1]) || /^\d{2}\/\d{2}\/\d{4}$/.test(cells[1])) {
      drawDate = normalizeDate(cells[1]);
      numStart = 2;
    }
    const rawNums = cells.slice(numStart);
    const valid = validateDraw(rawNums);

    if ("error" in valid) {
      report.discardReasons[valid.error] = (report.discardReasons[valid.error] || 0) + 1;
      report.totalDiscarded++;
      continue;
    }

    out.push({
      contestNumber: contest,
      drawDate,
      numbers: valid,
      source: "manual",
      syncedAt: timestamp,
      lastCheckedAt: timestamp
    });
    report.totalValid++;
  }
  return { draws: out, report };
}

function normalizeDate(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return s;
}
