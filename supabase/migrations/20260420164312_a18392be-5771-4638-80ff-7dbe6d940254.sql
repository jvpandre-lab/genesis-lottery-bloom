-- Histórico de concursos
CREATE TABLE public.lotomania_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_number integer NOT NULL UNIQUE,
  draw_date date,
  numbers integer[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lotomania_draws ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read draws" ON public.lotomania_draws FOR SELECT USING (true);
CREATE POLICY "public insert draws" ON public.lotomania_draws FOR INSERT WITH CHECK (true);
CREATE POLICY "public update draws" ON public.lotomania_draws FOR UPDATE USING (true);
CREATE POLICY "public delete draws" ON public.lotomania_draws FOR DELETE USING (true);

-- Gerações
CREATE TABLE public.generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  scenario text NOT NULL,
  requested_count integer NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all generations" ON public.generations FOR ALL USING (true) WITH CHECK (true);

-- Lotes
CREATE TABLE public.generation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  name text NOT NULL,
  purpose text NOT NULL,
  dominant_lineage text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generation_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all batches" ON public.generation_batches FOR ALL USING (true) WITH CHECK (true);

-- Jogos
CREATE TABLE public.generation_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.generation_batches(id) ON DELETE CASCADE,
  numbers integer[] NOT NULL,
  lineage text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generation_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all games" ON public.generation_games FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_batches_generation ON public.generation_batches(generation_id);
CREATE INDEX idx_games_batch ON public.generation_games(batch_id);