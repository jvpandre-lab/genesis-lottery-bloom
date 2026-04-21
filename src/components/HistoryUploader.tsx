import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, Database, FileWarning, Loader2 } from "lucide-react";
import { parseDrawsFile, syncDraws } from "@/services/contestService";
import { countDraws, upsertDraws, fetchRecentDraws } from "@/services/storageService";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const HistoryUploader = React.forwardRef<HTMLDivElement, { onChanged?: (total: number) => void }>(({ onChanged }, _ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState<number | null>(null);
  const [latestSync, setLatestSync] = useState<{ createdAt?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const c = await countDraws();
      setCount(c);
      if (c > 0) {
        const recent = await fetchRecentDraws(1);
        if (recent.length > 0) {
          setLatestSync({ createdAt: recent[0].createdAt });
        }
      } else {
        setLatestSync(null);
      }
      onChanged?.(c);
    } catch { setCount(null); setLatestSync(null); }
  }

  useEffect(() => { refresh(); }, []);

  async function handleSyncApi() {
    setBusy(true);
    try {
      const report = await syncDraws();
      if (report.status === "success") {
        toast({ title: "Sincronização OK", description: `${report.newRecordsAdded} concursos novos adicionados. ${report.recordsIgnoredDuplicate} já registrados.` });
      } else if (report.status === "fallback_banco") {
        toast({ title: "Fallback Automático", description: "API da Caixa demorou a responder ou falhou. Operando 100% com dados do banco atual.", variant: "destructive" });
      } else {
        toast({ title: "Erro Crítico", description: report.error || "A API e o Banco falharam simultaneamente.", variant: "destructive" });
      }
      await refresh();
    } catch (e: any) {
      toast({ title: "Falha de Sincronização", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const result = parseDrawsFile(text, file.name) as any;
      const { draws, report } = result;

      if (draws.length === 0) {
        toast({ title: "Nenhum concurso reconhecido", description: "Verifique o formato do arquivo.", variant: "destructive" });
        return;
      }
      const inserted = await upsertDraws(draws);
      const discardSummary = report?.discardReasons ? Object.entries(report.discardReasons).map(([reason, count]) => `${reason}: ${count}`).join(", ") : "";
      toast({
        title: "Histórico atualizado",
        description: `${inserted} concursos importados. Lidos: ${report?.totalRead || 0}, Válidos: ${report?.totalValid || 0}, Descartados: ${report?.totalDiscarded || 0}${discardSummary ? ` (${discardSummary})` : ""}.`
      });
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
          <div className="text-sm font-medium flex items-center gap-2">
            Histórico Oficial
          </div>
          <div className="text-[11px] text-muted-foreground flex flex-col mt-0.5">
            {count === null ? "Indisponível" : count === 0 ? (
              <span className="inline-flex items-center gap-1 text-yellow-500/80"><FileWarning className="h-3 w-3" /> Nenhum concurso. Anti-viés operará no escuro.</span>
            ) : (
              <span>{count} concursos armazenados na base local.</span>
            )}

            {latestSync?.createdAt && (
              <span className="text-[10px] opacity-75">
                Última sincronia: {formatDistanceToNow(new Date(latestSync.createdAt), { addSuffix: true, locale: ptBR })}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={handleSyncApi}
          disabled={busy}
          className="w-full sm:w-auto"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          <span className="ml-2">Sincronizar API</span>
        </Button>
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
          className="border-border/60 text-xs w-full sm:w-auto"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span className="ml-2">Upload Fallback</span>
        </Button>
      </div>
    </div>
  );
});
HistoryUploader.displayName = "HistoryUploader";
