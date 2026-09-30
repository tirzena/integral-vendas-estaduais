CREATE TABLE IF NOT EXISTS public.ui_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lang text NOT NULL CHECK (lang IN ('es','en')),
  source text NOT NULL,
  translated text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lang, source)
);

GRANT SELECT ON public.ui_translations TO anon, authenticated;
GRANT ALL ON public.ui_translations TO service_role;

ALTER TABLE public.ui_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ui_translations_read" ON public.ui_translations;
CREATE POLICY "ui_translations_read" ON public.ui_translations
FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS ui_translations_lang_idx ON public.ui_translations (lang);