import { Batch, BATCHES, LINEAGES } from "@/engine/lotteryTypes";
import { GameCard } from "./GameCard";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function BatchSection({ batch }: { batch: Batch }) {
  const meta = BATCHES[batch.name];
  const lin = LINEAGES[batch.dominant];
  const colorClass = `text-${meta.color}`;
  const ringColor = `bg-${meta.color}`;
  return (
    <section className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between glass-strong rounded-xl px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={cn("h-10 w-10 rounded-full flex items-center justify-center font-mono font-bold", ringColor, "shadow-glow")}>
            <span className="text-background">{batch.name[0]}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={cn("text-lg font-semibold tracking-tight", colorClass)}>Lote {batch.name}</h3>
              <Badge variant="outline" className="text-[10px]">{meta.purpose}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {meta.description} · Linhagem dominante: <span className="text-foreground/80">{lin.name}</span>
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6">
          <Metric label="Score médio" value={`${Math.round(batch.avgScore * 100)}`} />
          <Metric label="Diversidade" value={`${Math.round(batch.diversity * 100)}%`} />
          <Metric label="Jogos" value={String(batch.games.length)} />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {batch.games.map((g, i) => <GameCard key={i} game={g} index={i} />)}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono num-mono text-base text-foreground">{value}</div>
    </div>
  );
}
