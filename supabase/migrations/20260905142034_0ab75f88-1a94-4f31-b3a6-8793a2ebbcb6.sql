ALTER TABLE public.sales_scripts
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS credentials jsonb NOT NULL DEFAULT '[]'::jsonb;