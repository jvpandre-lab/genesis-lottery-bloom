import { Recommendation } from "@/engine/recommendationEngine";
import { Info, AlertTriangle, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";

export function RecommendationsPanel({ items }: { items: Recommendation[] }) {
  if (items.length === 0) return null;
  return (
    <div className="glass rounded-xl p-5 space-y-3">
      <h4 className="text-sm font-semibold tracking-tight">Recomendações do sistema</h4>
      <div className="space-y-2">
        {items.map((r, i) => {
          const Icon = r.level === "critical" ? AlertOctagon : r.level === "warn" ? AlertTriangle : Info;
          const tone = r.level === "critical" ? "text-destructive" : r.level === "warn" ? "text-warning" : "text-accent";
          return (
            <div key={i} className="flex gap-3 rounded-lg bg-surface-2/60 border border-border/50 p-3">
              <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", tone)} />
              <div className="space-y-0.5">
                <div className="text-[12px] font-medium">{r.title}</div>
                <div className="text-[11px] text-muted-foreground">{r.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
