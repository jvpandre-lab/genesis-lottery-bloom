import { GenerationDiagnostics } from "@/engine/generatorCore";
import { Cpu, Scale, Shuffle } from "lucide-react";

export function DiagnosticsPanel({ diag }: { diag: GenerationDiagnostics }) {
  return (
    <div className="glass rounded-xl p-5 space-y-3">
      <h4 className="text-sm font-semibold tracking-tight flex items-center gap-2"><Cpu className="h-4 w-4 text-primary" /> Diagnóstico da geração</h4>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md bg-surface-2/60 border border-border/50 p-2">
          <div className="text-muted-foreground text-[10px] uppercase">Contradições</div>
          <div className="font-mono num-mono text-base">{diag.contradictionsRejected}</div>
        </div>
        <div className="rounded-md bg-surface-2/60 border border-border/50 p-2">
          <div className="text-muted-foreground text-[10px] uppercase">Ajustes adaptativos</div>
          <div className="font-mono num-mono text-base">{diag.adjustments.reasons.length}</div>
        </div>
      </div>
      {diag.adjustments.reasons.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Shuffle className="h-3 w-3" /> Pressão adaptativa</div>
          {diag.adjustments.reasons.map((r, i) => (
            <div key={i} className="text-[11px] text-foreground/85 rounded-md bg-surface-2/60 border border-border/50 p-2">{r}</div>
          ))}
        </div>
      )}
      <details className="text-[11px]">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1.5"><Scale className="h-3 w-3" /> Decisões do árbitro ({diag.arbiterReasoning.length})</summary>
        <div className="mt-2 space-y-1 max-h-48 overflow-auto pr-1">
          {diag.arbiterReasoning.map((r, i) => (
            <div key={i} className="font-mono text-[10px] text-muted-foreground border-l-2 border-primary/30 pl-2">{r}</div>
          ))}
        </div>
      </details>
    </div>
  );
}
