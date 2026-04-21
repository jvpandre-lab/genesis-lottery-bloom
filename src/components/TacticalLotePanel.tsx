import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TacticalGame, TacticalRole } from "@/engine/tacticalRoleEngine";
import { Grid3x3, Layers } from "lucide-react";

const roleColors: Record<TacticalRole, string> = {
  'Anchor': 'bg-blue-500/20 text-blue-300',
  'Explorer': 'bg-purple-500/20 text-purple-300',
  'Breaker': 'bg-red-500/20 text-red-300',
  'Shield': 'bg-cyan-500/20 text-cyan-300',
  'Spreader': 'bg-yellow-500/20 text-yellow-300',
  'AntiCrowd': 'bg-green-500/20 text-green-300',
};

const roleDescriptions: Record<TacticalRole, string> = {
  'Anchor': 'Estabilidade estrutural',
  'Explorer': 'Exploração territorial',
  'Breaker': 'Ruptura de padrão',
  'Shield': 'Proteção contra falhas',
  'Spreader': 'Dispersão extrema',
  'AntiCrowd': 'Anti-padrão humano',
};

export const TacticalLotePanel = React.forwardRef<HTMLDivElement, { games?: TacticalGame[] }>(({ games = [] }, _ref) => {
  const composition: Record<TacticalRole, number> = {
    'Anchor': 0, 'Explorer': 0, 'Breaker': 0, 'Shield': 0, 'Spreader': 0, 'AntiCrowd': 0
  };

  for (const game of games) {
    composition[game.tacticalRole]++;
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium">Composição Tática</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(composition) as [TacticalRole, number][]).map(([role, count]) => (
            <div key={role} className="flex items-center gap-2">
              <Badge className={`text-xs ${roleColors[role]}`}>{role}</Badge>
              <span className="text-xs text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {games.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Jogos por Papel</div>
          <Tabs defaultValue="Anchor" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              {(Object.keys(composition) as TacticalRole[]).filter(role => composition[role] > 0).map(role => (
                <TabsTrigger key={role} value={role} className="text-xs py-1">
                  {role} ({composition[role]})
                </TabsTrigger>
              ))}
            </TabsList>
            {(Object.keys(composition) as TacticalRole[]).map(role => (
              <TabsContent key={role} value={role} className="space-y-2">
                {games
                  .filter(g => g.tacticalRole === role)
                  .map((game, i) => (
                    <Card key={i} className="glass p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="text-[10px] font-mono text-accent">{game.numbers.join(', ')}</div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            Score: {game.score.total.toFixed(2)} · Papel: {(game.roleScore * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
    </div>
  );
});
TacticalLotePanel.displayName = "TacticalLotePanel";