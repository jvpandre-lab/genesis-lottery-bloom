import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { backtest, fromGenerationResult, BacktestReport } from "@/engine/backtestEngine";
import { fetchRecentDraws } from "@/services/storageService";
import { Dezena, GenerationResult, BatchName, LineageId } from "@/engine/lotteryTypes";
import { Button } from "@/components/ui/button";
import { Loader2, History } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  currentGeneration?: GenerationResult | null;
}

interface StoredGen {
  scenario: string;
  batches: { name: BatchName; games: { numbers: Dezena[]; lineage: LineageId }[] }[];
}

export function BacktestPanel({ currentGeneration }: Props) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [drawsCount, setDrawsCount] = useState<number>(0);
  const [storedCount, setStoredCount] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const { count: dc } = await supabase.from("lotomania_draws").select("*", { count: "exact", head: true });
        setDrawsCount(dc ?? 0);
        const { count: gc } = await supabase.from("generations").select("*", { count: "exact", head: true });
        setStoredCount(gc ?? 0);
      } catch { /* ignore */ }
    })();
  }, [currentGeneration]);

  async function run() {
    setBusy(true);
    try {
      // carrega até 200 draws
      const draws = await fetchRecentDraws(200);

      // gera lista de gens (current + persistidas)
      const gens: StoredGen[] = [];
      if (currentGeneration) gens.push(fromGenerationResult(currentGeneration));

      // pega últimas 5 gerações persistidas
      const { data: gensRows } = await supabase
        .from("generations").select("id, scenario").order("created_at", { ascending: false }).limit(5);
      for (const g of gensRows ?? []) {
        const { data: bs } = await supabase
          .from("generation_batches").select("id, name").eq("generation_id", g.id);
        const batchesOut: StoredGen["batches"] = [];
        for (const b of bs ?? []) {
          const { data: games } = await supabase
            .from("generation_games").select("numbers, lineage").eq("batch_id", b.id);
          batchesOut.push({
            name: b.name as BatchName,
            games: (games ?? []).map((x) => ({ numbers: x.numbers as Dezena[], lineage: x.lineage as LineageId })),
          });
        }
        gens.push({ scenario: g.scenario, batches: batchesOut });
      }

      const rep = backtest(gens, draws, [50, 100, 200]);
      setReport(rep);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold tracking-tight flex items-center gap-2"><History className="h-4 w-4 text-accent" /> Backtest histórico</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {drawsCount} concursos · {storedCount} gerações persistidas
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={busy || drawsCount === 0}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rodar backtest"}
        </Button>
      </div>

      {drawsCount === 0 && (
        <div className="text-[11px] text-warning/90">Importe um histórico para habilitar.</div>
      )}

      {report && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {report.windows.map((w) => (
              <div key={w.windowSize} className="rounded-lg bg-surface-2/60 border border-border/50 p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Janela {w.windowSize}</div>
                <div className="text-base font-mono num-mono mt-1">{w.avgHits.toFixed(2)} <span className="text-[10px] text-muted-foreground">acertos médios</span></div>
                <div className="mt-2 space-y-0.5 text-[10px]">
                  <Row label="15+" v={w.freq15plus} />
                  <Row label="16+" v={w.freq16plus} />
                  <Row label="17+" v={w.freq17plus} />
                  <Row label="18+" v={w.freq18plus} />
                  <Row label="19+" v={w.freq19plus} />
                  <Row label="20" v={w.freq20} highlight />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Section title="Por linhagem">
              {report.perLineage.map((l) => (
                <RowItem key={l.lineage} label={l.lineage} value={`${l.avgHits.toFixed(2)} (${(l.freq15plus*100).toFixed(2)}% 15+)`} />
              ))}
            </Section>
            <Section title="Por lote">
              {report.perBatch.map((b) => (
                <RowItem key={b.batch} label={b.batch} value={`${b.avgHits.toFixed(2)} (${(b.freq15plus*100).toFixed(2)}% 15+)`} />
              ))}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, v, highlight }: { label: string; v: number; highlight?: boolean }) {
  return (
    <div className={cn("flex justify-between font-mono num-mono", highlight && "text-accent")}>
      <span className="text-muted-foreground">{label}</span><span>{(v * 100).toFixed(3)}%</span>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-2/60 border border-border/50 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function RowItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="capitalize text-foreground/85">{label}</span>
      <span className="font-mono num-mono text-muted-foreground">{value}</span>
    </div>
  );
}
