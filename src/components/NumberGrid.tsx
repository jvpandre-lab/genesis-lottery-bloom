import { formatDezena, Dezena } from "@/engine/lotteryTypes";
import { cn } from "@/lib/utils";

interface Props {
  numbers: Dezena[];
  highlight?: Set<number> | number[];
  size?: "sm" | "md" | "lg";
}

export function NumberGrid({ numbers, highlight, size = "md" }: Props) {
  const set = new Set(numbers);
  const hi = highlight instanceof Set ? highlight : new Set(highlight ?? []);
  const sizeMap = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-11 w-11 text-sm",
  };
  return (
    <div className="grid grid-cols-10 gap-1.5">
      {Array.from({ length: 100 }, (_, i) => {
        const isOn = set.has(i);
        const isHi = hi.has(i);
        return (
          <div
            key={i}
            className={cn(
              "flex items-center justify-center rounded-md font-mono num-mono transition-all",
              sizeMap[size],
              isOn
                ? "bg-gradient-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.5)]"
                : "bg-surface-2/60 text-muted-foreground/60 border border-border/40",
              isHi && !isOn && "ring-1 ring-accent/60"
            )}
          >
            {formatDezena(i)}
          </div>
        );
      })}
    </div>
  );
}
