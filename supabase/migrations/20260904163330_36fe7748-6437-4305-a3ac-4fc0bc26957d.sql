-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('superadmin','admin','gestor','vendedor','financeiro','estoque','fornecedor');
CREATE TYPE public.currency_code AS ENUM ('BRL','USD','PYG');

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  cargo TEXT,
  setor TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at DATE NOT NULL DEFAULT current_date,
  last_access TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('superadmin','admin'))
$$;

CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  SELECT count(*) INTO user_count FROM public.profiles WHERE is_demo = false;
  IF user_count <= 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'superadmin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ TEAMS ============
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  category TEXT,
  color TEXT NOT NULL DEFAULT '#3b6ef5',
  is_active BOOLEAN NOT NULL DEFAULT true,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  main_currency public.currency_code NOT NULL DEFAULT 'BRL',
  payment_methods TEXT,
  commercial_rules TEXT,
  goal_amount NUMERIC(14,2),
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.product_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_in_product TEXT NOT NULL DEFAULT 'vendedor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);
CREATE INDEX idx_product_users_user ON public.product_users(user_id);

CREATE OR REPLACE FUNCTION public.has_product_access(_user_id UUID, _product_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id)
      OR EXISTS (SELECT 1 FROM public.product_users pu WHERE pu.user_id = _user_id AND pu.product_id = _product_id)
$$;

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_type TEXT NOT NULL DEFAULT 'PF',
  name TEXT NOT NULL,
  trade_name TEXT,
  document TEXT,
  foreign_document TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  country TEXT DEFAULT 'Brasil',
  state TEXT,
  city TEXT,
  address TEXT,
  language TEXT DEFAULT 'pt-BR',
  birth_date DATE,
  origin TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_document ON public.customers(document);
CREATE INDEX idx_customers_whatsapp ON public.customers(whatsapp);

CREATE TABLE public.customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT, phone TEXT, email TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  title TEXT NOT NULL, file_path TEXT, file_url TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ PIPELINES ============
CREATE TABLE public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Funil principal',
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  stage_type TEXT NOT NULL DEFAULT 'aberto',
  color TEXT DEFAULT '#64748b',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stages_pipeline ON public.pipeline_stages(pipeline_id);

CREATE TABLE public.customer_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assistant_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  commercial_status TEXT NOT NULL DEFAULT 'lead',
  lead_origin TEXT, campaign TEXT, ad TEXT, channel TEXT, whatsapp_number TEXT,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_contact_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ,
  next_action TEXT,
  potential_value NUMERIC(14,2) DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'BRL',
  probability INT DEFAULT 0,
  loss_reason TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, product_id)
);
CREATE INDEX idx_cp_product ON public.customer_products(product_id);
CREATE INDEX idx_cp_owner ON public.customer_products(owner_id);

CREATE TABLE public.opportunity_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_product_id UUID NOT NULL REFERENCES public.customer_products(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_product_id UUID REFERENCES public.customer_products(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'nota',
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_product_id UUID REFERENCES public.customer_products(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'media',
  status TEXT NOT NULL DEFAULT 'aberta',
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_assignee ON public.tasks(assignee_id);

-- ============ SUPPLIERS ============
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  document TEXT, contact_name TEXT, phone TEXT, email TEXT,
  country TEXT, address TEXT,
  currencies public.currency_code[] NOT NULL DEFAULT '{BRL}',
  lead_time_days INT,
  commercial_terms TEXT, bank_details TEXT,
  rating INT, status TEXT NOT NULL DEFAULT 'ativo', notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, product_id)
);

-- ============ CONTENT LIBRARY ============
CREATE TABLE public.catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  title TEXT NOT NULL, category TEXT, description TEXT,
  content_type TEXT NOT NULL DEFAULT 'catalogo',
  file_url TEXT, link_url TEXT, version TEXT,
  published_at DATE DEFAULT current_date, expires_at DATE,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.price_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL, version INT NOT NULL DEFAULT 1,
  currency public.currency_code NOT NULL DEFAULT 'BRL',
  valid_from DATE DEFAULT current_date, valid_until DATE,
  is_current BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.price_table_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_table_id UUID NOT NULL REFERENCES public.price_tables(id) ON DELETE CASCADE,
  sku TEXT, description TEXT NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_quantity INT DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.sales_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  title TEXT NOT NULL, category TEXT, content TEXT,
  script_type TEXT NOT NULL DEFAULT 'script',
  status TEXT NOT NULL DEFAULT 'ativo',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ FX / QUOTES / ORDERS ============
CREATE TABLE public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency public.currency_code NOT NULL,
  quote_currency public.currency_code NOT NULL,
  rate NUMERIC(18,8) NOT NULL,
  safety_margin NUMERIC(6,3) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number SERIAL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  currency public.currency_code NOT NULL DEFAULT 'BRL',
  exchange_rate NUMERIC(18,8),
  exchange_rate_id UUID REFERENCES public.exchange_rates(id) ON DELETE SET NULL,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'rascunho',
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL, sku TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number SERIAL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  currency public.currency_code NOT NULL DEFAULT 'BRL',
  exchange_rate NUMERIC(18,8),
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aberto',
  cancel_reason TEXT,
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL, sku TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'BRL',
  method TEXT, paid_at DATE, due_date DATE,
  installment INT DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'BRL',
  due_date DATE NOT NULL DEFAULT current_date,
  paid_at DATE, category TEXT, cost_center TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'BRL',
  due_date DATE NOT NULL DEFAULT current_date,
  paid_at DATE, category TEXT, cost_center TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ INVENTORY ============
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  sku TEXT, name TEXT NOT NULL, variation TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  reserved NUMERIC(14,3) NOT NULL DEFAULT 0,
  cost NUMERIC(14,2) DEFAULT 0, price NUMERIC(14,2) DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'BRL',
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ META / WHATSAPP ============
CREATE TABLE public.meta_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  business_account_name TEXT, facebook_page_id TEXT, instagram_account_id TEXT,
  ad_account_id TEXT, app_id TEXT, webhook_url TEXT, verify_token TEXT,
  status TEXT NOT NULL DEFAULT 'nao_configurado',
  demo_mode BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  meta_integration_id UUID REFERENCES public.meta_integrations(id) ON DELETE SET NULL,
  waba_id TEXT, phone_number_id TEXT, display_phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'nao_configurado',
  demo_mode BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  contact_name TEXT, contact_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto',
  unread_count INT NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  last_message_at TIMESTAMPTZ DEFAULT now(),
  last_inbound_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'in',
  message_type TEXT NOT NULL DEFAULT 'text',
  body TEXT, media_url TEXT,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_internal_note BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'enviado',
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_msgs_conv ON public.whatsapp_messages(conversation_id);

-- ============ NOTICES ============
CREATE TABLE public.internal_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, content TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  is_urgent BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  allow_comments BOOLEAN NOT NULL DEFAULT true,
  require_read_receipt BOOLEAN NOT NULL DEFAULT false,
  publish_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  target_role public.app_role,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.notice_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES public.internal_notices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notice_id, user_id)
);
CREATE TABLE public.notice_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES public.internal_notices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notice_id, user_id)
);

-- ============ INTERNAL CHAT ============
CREATE TABLE public.internal_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  conversation_type TEXT NOT NULL DEFAULT 'grupo',
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  is_auto BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.internal_conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.internal_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);
CREATE TABLE public.internal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.internal_conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  body TEXT,
  attachment_url TEXT,
  reply_to UUID REFERENCES public.internal_messages(id) ON DELETE SET NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_int_msgs_conv ON public.internal_messages(conversation_id);
CREATE TABLE public.internal_message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE OR REPLACE FUNCTION public.is_conversation_member(_conv UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.internal_conversation_members m WHERE m.conversation_id = _conv AND m.user_id = _user)
$$;

-- ============ NOTIFICATIONS / AUDIT ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT, link TEXT,
  notification_type TEXT NOT NULL DEFAULT 'geral',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity TEXT NOT NULL, entity_id UUID, action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ GRANTS + RLS ============
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['teams','team_members','products','product_users','meta_integrations','whatsapp_accounts']) LOOP
    EXECUTE format('CREATE POLICY "%s_read" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_admin_write" ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))', t, t);
  END LOOP;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'customers','customer_contacts','customer_documents','customer_products','pipelines','pipeline_stages',
    'opportunity_history','activities','tasks','suppliers','supplier_products','catalogs','price_tables',
    'price_table_items','sales_scripts','exchange_rates','quotes','quote_items','orders','order_items',
    'payments','accounts_receivable','accounts_payable','inventory_items','inventory_movements',
    'whatsapp_conversations','whatsapp_messages','internal_notices','notice_recipients','notice_reads','audit_logs'
  ]) LOOP
    EXECUTE format('CREATE POLICY "%s_read" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_write" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_update" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_delete" ON public.%I FOR DELETE TO authenticated USING (public.is_admin(auth.uid()))', t, t);
  END LOOP;
END $$;

CREATE POLICY "conv_read" ON public.internal_conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(id, auth.uid()) OR public.is_admin(auth.uid()));
CREATE POLICY "conv_insert" ON public.internal_conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "conv_update" ON public.internal_conversations FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (true);
CREATE POLICY "conv_delete" ON public.internal_conversations FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "convmem_read" ON public.internal_conversation_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_conversation_member(conversation_id, auth.uid()) OR public.is_admin(auth.uid()));
CREATE POLICY "convmem_write" ON public.internal_conversation_members FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "intmsg_read" ON public.internal_messages FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "intmsg_insert" ON public.internal_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "intmsg_update" ON public.internal_messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (true);
CREATE POLICY "intmsg_delete" ON public.internal_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "intread_all" ON public.internal_message_reads FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "notif_read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notif_update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif_delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='updated_at'
           WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> 'profiles' LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

ALTER TABLE public.internal_messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;

CREATE OR REPLACE FUNCTION public.create_default_pipeline()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid UUID;
BEGIN
  INSERT INTO public.pipelines (product_id, name) VALUES (NEW.id, 'Funil principal') RETURNING id INTO pid;
  INSERT INTO public.pipeline_stages (pipeline_id, name, position, stage_type) VALUES
    (pid,'Novo lead',1,'aberto'),(pid,'Primeiro contato',2,'aberto'),(pid,'Qualificação',3,'aberto'),
    (pid,'Cotação',4,'aberto'),(pid,'Proposta enviada',5,'aberto'),(pid,'Negociação',6,'aberto'),
    (pid,'Fechado — ganho',7,'ganho'),(pid,'Fechado — perdido',8,'perdido'),(pid,'Pós-venda',9,'posvenda');
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_product_pipeline AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.create_default_pipeline();