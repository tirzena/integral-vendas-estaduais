CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text,
  brand_name text,
  tagline text,
  document text,
  state_registration text,
  address text,
  city text,
  state text,
  country text,
  zip_code text,
  phone text,
  phone_secondary text,
  whatsapp text,
  email text,
  website text,
  catalog_url text,
  logo_url text,
  invoice_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.company_settings TO authenticated;
GRANT INSERT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_settings_select" ON public.company_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "company_settings_insert_admin" ON public.company_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "company_settings_update_admin" ON public.company_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.company_settings (legal_name, brand_name, tagline, document, address, city, state, country, phone, phone_secondary, whatsapp, email, catalog_url)
VALUES ('Deppe D.L Ltda', 'DEPPE®', 'DISTRIBUIDORA E LOGISTICA', '42.305.998/0001-82', 'Jebai Ciudad del Este PY, 7000', 'Ciudad del Este / Foz do Iguaçu', 'PR', 'Paraguai / Brasil', '(45) 99133-9562', '(45) 9133-9562', '(45) 9133-9562', 'deppedistribuidoraelogistica@gmail.com', 'https://deppe.webloja.app');

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_installments text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS payment_installments text;