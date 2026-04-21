import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brainTensionEngine } from "@/engine/brainTensionEngine";
import { Zap, Brain, AlertCircle } from "lucide-react";

export const BrainTensionDiagnostics = React.forwardRef<HTMLDivElement, {}>((_props, _ref) => {
  const [analysis, setAnalysis] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    const a = brainTensionEngine.analyzeTension();
    const h = brainTensionEngine.getHealthReport();
    setAnalysis(a);
    setHealth(h);
  }, []);

  if (!analysis || !health) return <div className="text-muted-foreground text-xs">Carregando...</div>;

  return (
    <div className="space-y-4">
      <Card className="glass p-4">
        <div className="flex items-start gap-3">
          <Zap className="h-4 w-4 text-accent mt-1" />
          <div className="flex-1 space-y-2">
            <div className="font-medium text-sm">{analysis.status}</div>
            <p className="text-[11px] text-muted-foreground">{analysis.recommendation}</p>
            <div className="flex items-center gap-2">
              <div className="h-1.5 bg-surface-2 rounded-full flex-1">
                <div 
                  className="h-full bg-gradient-to-r from-red-500 to-green-500 rounded-full" 
                  style={{ width: `${analysis.health * 100}%` }}
                />
              </div>
              <Badge variant="outline" className="text-xs">{(analysis.health * 100).toFixed(0)}%</Badge>
            </div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="metrics" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="details">Detalhes</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Card className="glass p-3">
              <div className="text-[10px] text-muted-foreground mb-1">Brain A</div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-mono font-bold">{(health.brainAStrength * 100).toFixed(0)}</span>
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </Card>
            <Card className="glass p-3">
              <div className="text-[10px] text-muted-foreground mb-1">Brain B</div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-mono font-bold">{(health.brainBStrength * 100).toFixed(0)}</span>
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </Card>
            <Card className="glass p-3">
              <div className="text-[10px] text-muted-foreground mb-1">Árbitro</div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-mono font-bold">{(health.arbitratorEffectiveness * 100).toFixed(0)}</span>
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </Card>
            <Card className="glass p-3">
              <div className="text-[10px] text-muted-foreground mb-1">Tensão</div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-mono font-bold">{(health.overallTensionHealth * 100).toFixed(0)}</span>
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="details" className="space-y-2">
          <div className="text-[10px] text-muted-foreground space-y-2">
            <p>A tensão entre os dois cérebros é o equilíbrio entre conservadorismo e exploração. Uma tensão saudável permite inovação com estabilidade.</p>
            <p className="text-xs font-medium">Estado atual:</p>
            <ul className="space-y-1 pl-3">
              <li>• Brain A favorecendo: {health.brainAStrength > 0.55 ? 'Estabilidade' : 'Exploração'}</li>
              <li>• Brain B favorecendo: {health.brainBStrength > 0.55 ? 'Exploração' : 'Estabilidade'}</li>
              <li>• Árbitro: {health.arbitratorEffectiveness > 0.7 ? 'Funcionando bem' : 'Sob pressão'}</li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
});
BrainTensionDiagnostics.displayName = "BrainTensionDiagnostics";