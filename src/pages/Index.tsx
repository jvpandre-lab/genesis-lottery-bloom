import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Activity, Layers, Cpu, Shuffle, Target } from "lucide-react";
import { generate, GenerationDiagnostics } from "@/engine/generatorCore";
import { GenerationResult, Scenario } from "@/engine/lotteryTypes";
import { fetchRecentDraws, persistGeneration } from "@/services/storageService";
import { BatchSection } from "@/components/BatchSection";
import { TerritoryHeatmap } from "@/components/TerritoryHeatmap";
import { HistoryUploader } from "@/components/HistoryUploader";
import { BacktestPanel } from "@/components/BacktestPanel";
import { RecommendationsPanel } from "@/components/RecommendationsPanel";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";
import { EcosystemDashboard } from "@/components/EcosystemDashboard";
import { TacticalLotePanel } from "@/components/TacticalLotePanel";
import { BrainTensionDiagnostics } from "@/components/BrainTensionDiagnostics";
import { recommend } from "@/engine/recommendationEngine";
import { globalPressure } from "@/engine/adaptivePressureEngine";
import { integrateEcosystemFlow } from "@/engine/ecoIntegration";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const COUNTS = [1, 3, 5, 10, 15] as const;

const SCENARIOS: { id: Scenario; label: string; hint: string }[] = [
  { id: "conservative", label: "Conservador", hint: "Estabilidade estrutural" },
  { id: "hybrid", label: "Híbrido", hint: "Equilíbrio adaptativo" },
  { id: "aggressive", label: "Agressivo", hint: "Ruptura de padrões" },
  { id: "exploratory", label: "Exploratório", hint: "Caos controlado" },
];

const Index = () => {
  const [count, setCount] = useState<number>(5);
  const [scenario, setScenario] = useState<Scenario>("hybrid");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [diag, setDiag] = useState<GenerationDiagnostics | null>(null);
  const [draws, setDraws] = useState<number>(0);

  async function handleGenerate() {
    setBusy(true);
    try {
      let recent: any[] = [];
      try { recent = await fetchRecentDraws(8); } catch {}
      await new Promise((r) => setTimeout(r, 30));
      const res = await generate({ count, scenario, recentDraws: recent, twoBrains: true });
      const { diagnostics, ...gen } = res;
      setResult(gen as GenerationResult);
      setDiag(diagnostics);
      try { await persistGeneration(gen as GenerationResult); } catch (e: any) {
        toast({ title: "Geração concluída (não persistida)", description: e?.message ?? "" });
      }
      // Integrate ecosystem analysis
      try {
        await integrateEcosystemFlow(gen as GenerationResult, diagnostics);
        toast({ title: "Ecossistema atualizado", description: "Análise territorial, tática e cerebral integrada." });
      } catch (e: any) {
        console.warn("Ecosystem integration failed:", e);
      }
    } catch (e: any) {
      toast({ title: "Falha ao gerar", description: e?.message ?? "Erro desconhecido", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const recommendations = useMemo(() => {
    if (!result || !diag) return [];
    globalPressure.load();
    return recommend(result, globalPressure.signals(), diag.adjustments);
  }, [result, diag]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur-xl bg-surface-0/70 sticky top-0 z-30">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">Aurum · Lotomania</div>
              <div className="text-[10px] text-muted-foreground -mt-0.5 uppercase tracking-widest">Sistema Evolutivo</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="font-mono num-mono"><Cpu className="h-3 w-3 mr-1.5" />6 linhagens</Badge>
            <Badge variant="outline" className="font-mono num-mono"><Layers className="h-3 w-3 mr-1.5" />4 lotes</Badge>
            <Badge variant="outline" className="font-mono num-mono"><Activity className="h-3 w-3 mr-1.5" />GA + território</Badge>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl glass-strong p-8 md:p-12">
          <div className="absolute inset-0 bg-gradient-glow pointer-events-none" />
          <div className="relative z-10 max-w-3xl">
            <Badge className="bg-gradient-accent text-accent-foreground border-0 mb-4">v1 · Núcleo profundo</Badge>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight">
              Construção estratégica <span className="text-gradient">evolutiva</span> para Lotomania
            </h1>
            <p className="mt-4 text-muted-foreground max-w-2xl">
              Linhagens com identidade própria, mapa territorial vivo, motor genético com pressão adaptativa e
              motor de contradição que rejeita jogos confortáveis demais. Cada geração é uma exploração real do espaço 00–99.
            </p>
          </div>
        </section>

        {/* Histórico */}
        <HistoryUploader onChanged={setDraws} />

        {/* Controles */}
        <section className="glass-strong rounded-2xl p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Quantidade de jogos</div>
              <div className="flex flex-wrap gap-2">
                {COUNTS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={cn(
                      "h-12 min-w-[64px] px-4 rounded-xl font-mono num-mono text-base border transition-all",
                      count === n
                        ? "bg-gradient-primary text-primary-foreground border-transparent shadow-glow"
                        : "bg-surface-2/60 border-border/60 text-foreground/80 hover:border-primary/50"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 md:max-w-md w-full">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Cenário operacional</div>
              <Tabs value={scenario} onValueChange={(v) => setScenario(v as Scenario)}>
                <TabsList className="grid grid-cols-4 bg-surface-2/60 border border-border/60">
                  {SCENARIOS.map((s) => (
                    <TabsTrigger key={s.id} value={s.id} className="data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground text-xs">
                      {s.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <p className="text-[11px] text-muted-foreground">{SCENARIOS.find((s) => s.id === scenario)?.hint}</p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
              <Shuffle className="h-3.5 w-3.5" />
              {draws > 0 ? `${draws} concursos disponíveis para anti-viés.` : "Anti-viés operará apenas em modo interno."}
            </div>
            <Button
              onClick={handleGenerate}
              disabled={busy}
              size="lg"
              className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
            >
              {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Evoluindo {count} jogo{count > 1 ? "s" : ""}…</> : <><Target className="h-4 w-4 mr-2" /> Gerar {count} jogo{count > 1 ? "s" : ""}</>}
            </Button>
          </div>
        </section>

        {/* Resultado */}
        {result && (
          <section className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Score médio" value={`${Math.round(result.metrics.avgScore * 100)}`} suffix="/100" tone="primary" />
              <Kpi label="Diversidade" value={`${Math.round(result.metrics.avgDiversity * 100)}%`} tone="accent" />
              <Kpi label="Cobertura" value={`${Math.round(result.metrics.avgCoverage * 100)}%`} />
              <Kpi label="Entropia territorial" value={`${(result.metrics.territoryEntropy * 100).toFixed(1)}%`} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-8">
                {result.batches.map((b) => <BatchSection key={b.name} batch={b} />)}
              </div>
              <aside className="space-y-6">
                <TerritoryHeatmap result={result} />
                {diag && <DiagnosticsPanel diag={diag} />}
                {recommendations.length > 0 && <RecommendationsPanel items={recommendations} />}
                <BacktestPanel currentGeneration={result} />
                <EcosystemDashboard />
                <TacticalLotePanel />
                <BrainTensionDiagnostics />
                <div className="glass rounded-xl p-5 space-y-3">
                  <h4 className="text-sm font-semibold tracking-tight">Composição das linhagens</h4>
                  <LineageBreakdown result={result} />
                </div>
              </aside>
            </div>
          </section>
        )}

        {!result && !busy && (
          <section className="glass rounded-2xl p-10 text-center text-muted-foreground">
            <Sparkles className="h-6 w-6 mx-auto text-primary mb-3" />
            <p className="text-sm">Configure o cenário e a quantidade, depois clique em <span className="text-foreground">Gerar</span> para iniciar a primeira evolução.</p>
          </section>
        )}
      </main>

      <footer className="border-t border-border/40 mt-16">
        <div className="container py-6 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>Aurum Lotomania · sistema experimental, não garante prêmios.</span>
          <span className="font-mono num-mono">domínio 00–99 · 50 dezenas/jogo</span>
        </div>
      </footer>
    </div>
  );
};

function Kpi({ label, value, suffix, tone }: { label: string; value: string; suffix?: string; tone?: "primary" | "accent" }) {
  return (
    <div className="glass rounded-xl px-5 py-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-mono num-mono font-semibold", tone === "primary" && "text-gradient", tone === "accent" && "text-accent")}>
        {value}<span className="text-xs text-muted-foreground ml-1">{suffix}</span>
      </div>
    </div>
  );
}

function LineageBreakdown({ result }: { result: GenerationResult }) {
  const counts: Record<string, number> = {};
  for (const b of result.batches) for (const g of b.games) counts[g.lineage] = (counts[g.lineage] ?? 0) + 1;
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-2">
      {entries.map(([lin, n]) => (
        <div key={lin} className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className={`text-lineage-${lin} font-medium capitalize`}>{lin}</span>
            <span className="font-mono num-mono text-muted-foreground">{n}/{total}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div className={`h-full bg-lineage-${lin}`} style={{ width: `${(n / total) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default Index;
