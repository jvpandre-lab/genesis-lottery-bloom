import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, Database, FileWarning, Loader2 } from "lucide-react";
import { parseDrawsFile } from "@/services/contestService";
import { countDraws, upsertDraws } from "@/services/storageService";
import { toast } from "@/hooks/use-toast";

export function HistoryUploader({ onChanged }: { onChanged?: (total: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const c = await countDraws();
      setCount(c);
      onChanged?.(c);
    } catch { setCount(null); }
  }

  useEffect(() => { refresh(); }, []);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const draws = parseDrawsFile(text, file.name);
      if (draws.length === 0) {
        toast({ title: "Nenhum concurso reconhecido", description: "Verifique o formato do arquivo.", variant: "destructive" });
        return;
      }
      const inserted = await upsertDraws(draws);
      toast({ title: "Histórico atualizado", description: `${inserted} concursos importados.` });
      await refresh();
    } catch (e: any) {
      toast({ title: "Falha ao importar", description: e?.message ?? "Erro desconhecido", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-surface-2 border border-border/60 flex items-center justify-center">
          <Database className="h-5 w-5 text-accent" />
        </div>
        <div>
          <div className="text-sm font-medium">Histórico de Concursos</div>
          <div className="text-[11px] text-muted-foreground">
            {count === null ? "Indisponível" : count === 0 ? (
              <span className="inline-flex items-center gap-1"><FileWarning className="h-3 w-3" /> Nenhum concurso carregado — anti-viés operará apenas em modo interno.</span>
            ) : (
              <>{count} concursos no banco · usados para anti-viés e backtest.</>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {count !== null && count > 0 && <Badge variant="outline" className="font-mono num-mono">{count}</Badge>}
        <Input
          ref={inputRef}
          type="file"
          accept=".csv,.json,.txt"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="border-border/60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span className="ml-2">Importar CSV/JSON</span>
        </Button>
      </div>
    </div>
  );
}
