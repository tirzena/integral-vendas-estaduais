ALTER TABLE public.internal_notices
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS video_url text;

ALTER TABLE public.internal_notices
  ALTER COLUMN publish_at SET DEFAULT now();

UPDATE public.internal_notices
SET publish_at=created_at
WHERE publish_at IS NULL;

ALTER TABLE public.internal_notices
  ALTER COLUMN publish_at SET NOT NULL;
