import { useMemo } from "react";
import { GenerationResult, formatDezena } from "@/engine/lotteryTypes";
import { cn } from "@/lib/utils";

/** Heatmap 10x10 do espaço numérico baseado no uso global da geração. */
export function TerritoryHeatmap({ result }: { result: GenerationResult }) {
  const usage = useMemo(() => {
    const u = new Array(100).fill(0);
    for (const b of result.batches) for (const g of b.games) for (const n of g.numbers) u[n]++;
    return u;
  }, [result]);
  const max = Math.max(1, ...usage);
  const expected = result.batches.reduce((s, b) => s + b.games.length, 0) * 0.5;

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold tracking-tight">Mapa Territorial</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">Ocupação do espaço 00–99 nesta geração.</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Entropia</div>
          <div className="font-mono num-mono text-gradient text-lg">{(result.metrics.territoryEntropy * 100).toFixed(1)}%</div>
        </div>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {usage.map((u, i) => {
          const ratio = u / max;
          const overUsed = u > expected * 1.25;
          const underUsed = u < expected * 0.5;
          return (
            <div
              key={i}
              className={cn(
                "aspect-square rounded text-[9px] font-mono num-mono flex items-center justify-center border border-border/40 transition-colors",
                overUsed && "ring-1 ring-destructive/40",
                underUsed && "ring-1 ring-accent/40"
              )}
              style={{
                background: `linear-gradient(135deg, hsl(252 83% ${20 + ratio * 50}% / ${0.25 + ratio * 0.7}), hsl(188 95% ${30 + ratio * 40}% / ${0.15 + ratio * 0.6}))`,
              }}
              title={`${formatDezena(i)} — usada ${u}x`}
            >
              <span className="text-foreground/70">{formatDezena(i)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded ring-1 ring-destructive/60 inline-block" /> Saturado</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded ring-1 ring-accent/60 inline-block" /> Sub-explorado</span>
      </div>
    </div>
  );
}
