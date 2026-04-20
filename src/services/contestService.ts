import { Dezena, DrawRecord } from "@/engine/lotteryTypes";

/**
 * Aceita CSV (linhas: concurso,data,d1,d2,...,d20)
 * ou JSON (array de objetos {concurso/contest_number/contestNumber, data/draw_date, dezenas/numbers}).
 */
export function parseDrawsFile(content: string, filename: string): DrawRecord[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (filename.toLowerCase().endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseJSON(trimmed);
  }
  return parseCSV(trimmed);
}

function parseJSON(content: string): DrawRecord[] {
  const data = JSON.parse(content);
  const arr = Array.isArray(data) ? data : Array.isArray((data as any).results) ? (data as any).results : [];
  const out: DrawRecord[] = [];
  for (const item of arr) {
    const contest = Number(item.contestNumber ?? item.contest_number ?? item.concurso ?? item.numero ?? item.number);
    const drawDate = item.drawDate ?? item.draw_date ?? item.data ?? item.date;
    const rawNums = item.numbers ?? item.dezenas ?? item.dezenasSorteadas ?? item.dezenas_sorteadas;
    if (!contest || !rawNums) continue;
    const nums = (Array.isArray(rawNums) ? rawNums : String(rawNums).split(/[,\s;|-]+/))
      .map((n: any) => Number(String(n).trim()))
      .filter((n: number) => Number.isFinite(n) && n >= 0 && n <= 99);
    if (nums.length < 18) continue;
    out.push({ contestNumber: contest, drawDate: typeof drawDate === "string" ? drawDate.slice(0, 10) : undefined, numbers: dedupeNums(nums as Dezena[]) });
  }
  return out;
}

function parseCSV(content: string): DrawRecord[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: DrawRecord[] = [];
  // detecta header
  let start = 0;
  if (/[a-zA-Z]/.test(lines[0])) start = 1;
  for (let i = start; i < lines.length; i++) {
    const cells = lines[i].split(/[,;\t]/).map((s) => s.trim()).filter(Boolean);
    if (cells.length < 5) continue;
    const contest = Number(cells[0]);
    if (!Number.isFinite(contest)) continue;
    let drawDate: string | undefined;
    let numStart = 1;
    // segundo campo pode ser data
    if (/^\d{4}-\d{2}-\d{2}$/.test(cells[1]) || /^\d{2}\/\d{2}\/\d{4}$/.test(cells[1])) {
      drawDate = normalizeDate(cells[1]);
      numStart = 2;
    }
    const nums = cells.slice(numStart).map((s) => Number(s)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 99);
    if (nums.length < 18) continue;
    out.push({ contestNumber: contest, drawDate, numbers: dedupeNums(nums as Dezena[]) });
  }
  return out;
}

function dedupeNums(nums: Dezena[]): Dezena[] {
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function normalizeDate(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [d, m, y] = s.split("/");
  return `${y}-${m}-${d}`;
}
