import { Dezena, DrawRecord } from "@/engine/lotteryTypes";

export interface ImportReport {
  totalRead: number;
  totalValid: number;
  totalDiscarded: number;
  discardReasons: Record<string, number>;
}

/**
 * Aceita CSV (linhas: concurso,data,d1,d2,...,d20)
 * ou JSON (array de objetos {concurso/contest_number/contestNumber, data/draw_date, dezenas/numbers}).
 * Retorna draws válidos e relatório de importação.
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
  for (const item of arr) {
    let reasonForDiscard: string | null = null;
    
    const contest = Number(item.contestNumber ?? item.contest_number ?? item.concurso ?? item.numero ?? item.number);
    const drawDate = item.drawDate ?? item.draw_date ?? item.data ?? item.date;
    const rawNums = item.numbers ?? item.dezenas ?? item.dezenasSorteadas ?? item.dezenas_sorteadas;
    
    if (!contest || !rawNums) {
      reasonForDiscard = "missing_contest_or_numbers";
    } else if (!Number.isFinite(contest) || contest < 1) {
      reasonForDiscard = "invalid_contest_number";
    } else {
      const nums = (Array.isArray(rawNums) ? rawNums : String(rawNums).split(/[,\s;|-]+/))
        .map((n: any) => Number(String(n).trim()))
        .filter((n: number) => Number.isFinite(n) && n >= 0 && n <= 99);
      if (nums.length < 18) {
        reasonForDiscard = "insufficient_numbers";
      } else if (nums.length > 20) {
        reasonForDiscard = "too_many_numbers";
      } else if (!isSorted(nums as Dezena[])) {
        // Check if sorted BEFORE deduping
        reasonForDiscard = "unsorted_numbers";
      } else {
        const deduped = dedupeNums(nums as Dezena[]);
        if (deduped.length !== nums.length) {
          reasonForDiscard = "duplicate_numbers";
        } else {
          out.push({ contestNumber: contest, drawDate: typeof drawDate === "string" ? drawDate.slice(0, 10) : undefined, numbers: deduped });
          report.totalValid++;
        }
      }
    }

    if (reasonForDiscard) {
      report.discardReasons[reasonForDiscard] = (report.discardReasons[reasonForDiscard] || 0) + 1;
      report.totalDiscarded++;
    }
  }
  return { draws: out, report };
}

function parseCSV(content: string): { draws: DrawRecord[], report: ImportReport } {
  const report: ImportReport = { totalRead: 0, totalValid: 0, totalDiscarded: 0, discardReasons: {} };
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  report.totalRead = lines.length;
  const out: DrawRecord[] = [];
  // detecta header
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
    // segundo campo pode ser data
    if (/^\d{4}-\d{2}-\d{2}$/.test(cells[1]) || /^\d{2}\/\d{2}\/\d{4}$/.test(cells[1])) {
      drawDate = normalizeDate(cells[1]);
      numStart = 2;
    }
    const nums = cells.slice(numStart).map((s) => Number(s)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 99);
    if (nums.length < 18) {
      report.discardReasons["insufficient_numbers"] = (report.discardReasons["insufficient_numbers"] || 0) + 1;
      report.totalDiscarded++;
      continue;
    }
    if (nums.length > 20) {
      report.discardReasons["too_many_numbers"] = (report.discardReasons["too_many_numbers"] || 0) + 1;
      report.totalDiscarded++;
      continue;
    }
    // Check if sorted BEFORE deduping
    if (!isSorted(nums as Dezena[])) {
      report.discardReasons["unsorted_numbers"] = (report.discardReasons["unsorted_numbers"] || 0) + 1;
      report.totalDiscarded++;
      continue;
    }
    const deduped = dedupeNums(nums as Dezena[]);
    if (deduped.length !== nums.length) {
      report.discardReasons["duplicate_numbers"] = (report.discardReasons["duplicate_numbers"] || 0) + 1;
      report.totalDiscarded++;
      continue;
    }
    out.push({ contestNumber: contest, drawDate, numbers: deduped });
    report.totalValid++;
  }
  return { draws: out, report };
}

function dedupeNums(nums: Dezena[]): Dezena[] {
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function isSorted(nums: Dezena[]): boolean {
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] < nums[i - 1]) return false;
  }
  return true;
}

function normalizeDate(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [d, m, y] = s.split("/");
  return `${y}-${m}-${d}`;
}
