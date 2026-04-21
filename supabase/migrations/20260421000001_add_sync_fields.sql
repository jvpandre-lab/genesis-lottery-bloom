-- Add sync fields to lotomania_draws
ALTER TABLE public.lotomania_draws ADD COLUMN source text;
ALTER TABLE public.lotomania_draws ADD COLUMN synced_at timestamptz;
ALTER TABLE public.lotomania_draws ADD COLUMN last_checked_at timestamptz;