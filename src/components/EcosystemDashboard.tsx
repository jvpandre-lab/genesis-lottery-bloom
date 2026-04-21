import React, { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart, TrendingUp, Zap, AlertTriangle, CheckCircle } from "lucide-react";
import { cycleMemoryEngine, CycleHealth } from "@/engine/cycleMemoryEngine";
import { metaTerritoryEngine } from "@/engine/metaTerritoryEngine";
import { lineageDriftEngine, DriftDetection } from "@/engine/lineageDriftEngine";
import { brainTensionEngine } from "@/engine/brainTensionEngine";

export const EcosystemDashboard = React.forwardRef<HTMLDivElement, {}>((_props, _ref) => {
  const [cycleHealth, setCycleHealth] = useState<CycleHealth | null>(null);
  const [drifts, setDrifts] = useState<DriftDetection[]>([]);
  const [brainHealth, setBrainHealth] = useState<any>(null);

  useEffect(() => {
    const health = cycleMemoryEngine.getCycleHealth('last5');
    setCycleHealth(health);

    const allDrifts = lineageDriftEngine.getAllDrifts();
    setDrifts(allDrifts);

    const bh = brainTensionEngine.getHealthReport();
    setBrainHealth(bh);
  }, []);

  if (!cycleHealth || !brainHealth) return <div className="text-muted-foreground text-sm">Carregando...</div>;

  return (
    <Tabs defaultValue="health" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="health">Saúde</TabsTrigger>
        <TabsTrigger value="territory">Território</TabsTrigger>
        <TabsTrigger value="lineage">Linhagens</TabsTrigger>
        <TabsTrigger value="brains">Cérebros</TabsTrigger>
      </TabsList>

      <TabsContent value="health" className="space-y-4">
        <Card className="glass p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Score de Saúde</span>
              </div>
              <Badge variant="outline" className="font-mono">{(cycleHealth.healthScore * 100).toFixed(0)}%</Badge>
            </div>
            <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-500 to-green-500" style={{ width: `${cycleHealth.healthScore * 100}%` }} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              Fadiga: {(cycleHealth.fatigueLevel * 100).toFixed(0)}% · Instabilidade: {(cycleHealth.instability * 100).toFixed(0)}%
            </div>
            {cycleHealth.recoveryNeed && (
              <div className="flex items-center gap-2 text-xs text-yellow-500">
                <AlertTriangle className="h-3 w-3" />
                Recuperação necessária
              </div>
            )}
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="territory" className="space-y-4">
        <Card className="glass p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium">Análise Territorial</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Zonas de pressão, cobertura, drift detectados em tempo real.</p>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="lineage" className="space-y-4">
        {drifts.length === 0 ? (
          <Card className="glass p-4">
            <div className="text-[11px] text-muted-foreground">Nenhuma linhagem com desvio detectado.</div>
          </Card>
        ) : (
          drifts.map(drift => (
            <Card key={drift.lineage} className="glass p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{drift.lineage}</span>
                  <Badge variant={drift.status === 'lost' ? 'destructive' : drift.status === 'drifting' ? 'secondary' : 'outline'}>
                    {drift.status}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{drift.recommendation}</p>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500" style={{ width: `${drift.driftMagnitude * 100}%` }} />
                </div>
              </div>
            </Card>
          ))
        )}
      </TabsContent>

      <TabsContent value="brains" className="space-y-4">
        <Card className="glass p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium">Tensão entre Cérebros</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-[11px]">
              <div>
                <div className="text-muted-foreground mb-1">Brain A</div>
                <Badge className="font-mono">{(brainHealth.brainAStrength * 100).toFixed(0)}%</Badge>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Brain B</div>
                <Badge className="font-mono">{(brainHealth.brainBStrength * 100).toFixed(0)}%</Badge>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Árbitro</div>
                <Badge className="font-mono">{(brainHealth.arbitratorEffectiveness * 100).toFixed(0)}%</Badge>
              </div>
            </div>
          </div>
        </Card>
      </TabsContent>
    </Tabs>
  );
});
EcosystemDashboard.displayName = "EcosystemDashboard";