CREATE TABLE public.contact_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  source TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_lists TO authenticated;
GRANT ALL ON public.contact_lists TO service_role;
ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listas leitura" ON public.contact_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "listas insercao" ON public.contact_lists FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "listas edicao" ON public.contact_lists FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "listas exclusao" ON public.contact_lists FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_contact_lists_updated BEFORE UPDATE ON public.contact_lists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contact_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  company TEXT,
  city TEXT,
  origin TEXT,
  notes TEXT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'novo',
  customer_product_id UUID REFERENCES public.customer_products(id) ON DELETE SET NULL,
  sent_to_crm_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contact_leads_list ON public.contact_leads(list_id);
CREATE INDEX idx_contact_leads_assigned ON public.contact_leads(assigned_to);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_leads TO authenticated;
GRANT ALL ON public.contact_leads TO service_role;
ALTER TABLE public.contact_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contatos leitura" ON public.contact_leads FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR assigned_to = auth.uid() OR assigned_to IS NULL);
CREATE POLICY "contatos insercao" ON public.contact_leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "contatos edicao" ON public.contact_leads FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR assigned_to = auth.uid() OR assigned_to IS NULL)
  WITH CHECK (true);
CREATE POLICY "contatos exclusao" ON public.contact_leads FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_contact_leads_updated BEFORE UPDATE ON public.contact_leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();