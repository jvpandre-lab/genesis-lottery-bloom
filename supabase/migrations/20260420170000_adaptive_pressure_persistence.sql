-- Tabelas para persistência da pressão adaptativa

CREATE TABLE public.adaptive_pressure_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid REFERENCES public.generations(id) ON DELETE CASCADE,
  signal_type text NOT NULL, -- e.g., 'territory_saturation', 'diversity_drop'
  value numeric NOT NULL,
  threshold numeric,
  triggered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.adaptive_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid REFERENCES public.generations(id) ON DELETE CASCADE,
  adjustment_type text NOT NULL, -- e.g., 'pressure_increase', 'scenario_shift'
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lineage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid REFERENCES public.generations(id) ON DELETE CASCADE,
  lineage text NOT NULL,
  dominance_score numeric NOT NULL,
  exploration_rate numeric,
  stability_score numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.territory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid REFERENCES public.generations(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL, -- territory map
  saturation_level numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.scenario_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_scenario text,
  to_scenario text NOT NULL,
  reason text NOT NULL,
  triggered_by jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.adaptive_pressure_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all pressure signals" ON public.adaptive_pressure_signals FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.adaptive_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all adjustments" ON public.adaptive_adjustments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.lineage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all lineage history" ON public.lineage_history FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.territory_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all territory snapshots" ON public.territory_snapshots FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.scenario_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all scenario transitions" ON public.scenario_transitions FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_pressure_generation ON public.adaptive_pressure_signals(generation_id);
CREATE INDEX idx_adjustments_generation ON public.adaptive_adjustments(generation_id);
CREATE INDEX idx_lineage_generation ON public.lineage_history(generation_id);
CREATE INDEX idx_territory_generation ON public.territory_snapshots(generation_id);</content>
<parameter name="filePath">c:\Users\User\Desktop\Lotomania\genesis-lottery-bloom\supabase\migrations\20260420170000_adaptive_pressure_persistence.sql