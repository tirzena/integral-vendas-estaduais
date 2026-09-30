-- Remuneração dos membros
CREATE TABLE public.member_compensations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  comp_type TEXT NOT NULL DEFAULT 'percent',
  amount NUMERIC NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  period TEXT NOT NULL DEFAULT 'month',
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_compensations TO authenticated;
GRANT ALL ON public.member_compensations TO service_role;
ALTER TABLE public.member_compensations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comp_read" ON public.member_compensations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "comp_admin_write" ON public.member_compensations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Regras de bonificação
CREATE TABLE public.bonus_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  metric TEXT NOT NULL DEFAULT 'orders',
  threshold NUMERIC NOT NULL DEFAULT 0,
  reward_type TEXT NOT NULL DEFAULT 'fixed',
  reward_value NUMERIC NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  period TEXT NOT NULL DEFAULT 'month',
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_rules TO authenticated;
GRANT ALL ON public.bonus_rules TO service_role;
ALTER TABLE public.bonus_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonusrule_read" ON public.bonus_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "bonusrule_admin_write" ON public.bonus_rules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Bonificações concedidas
CREATE TABLE public.bonus_awards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.bonus_rules(id) ON DELETE SET NULL,
  description TEXT,
  period_start DATE,
  period_end DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pendente',
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_awards TO authenticated;
GRANT ALL ON public.bonus_awards TO service_role;
ALTER TABLE public.bonus_awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonusaward_read" ON public.bonus_awards FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "bonusaward_admin_write" ON public.bonus_awards FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Folha de pagamento
CREATE TABLE public.payroll_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL DEFAULT 'fixed',
  description TEXT,
  period_start DATE,
  period_end DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'aberto',
  paid_at DATE,
  payable_id UUID REFERENCES public.accounts_payable(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_entries TO authenticated;
GRANT ALL ON public.payroll_entries TO service_role;
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_read" ON public.payroll_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "payroll_admin_write" ON public.payroll_entries FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Investimentos
CREATE TABLE public.investments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'personal',
  name TEXT NOT NULL,
  category TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  invested_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_return NUMERIC,
  realized_return NUMERIC,
  status TEXT NOT NULL DEFAULT 'ativo',
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investments TO authenticated;
GRANT ALL ON public.investments TO service_role;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_read" ON public.investments FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "inv_insert" ON public.investments FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND (scope = 'personal' OR public.is_admin(auth.uid())));
CREATE POLICY "inv_update" ON public.investments FOR UPDATE TO authenticated
  USING ((owner_id = auth.uid() AND scope = 'personal') OR public.is_admin(auth.uid()))
  WITH CHECK ((owner_id = auth.uid() AND scope = 'personal') OR public.is_admin(auth.uid()));
CREATE POLICY "inv_delete" ON public.investments FOR DELETE TO authenticated
  USING ((owner_id = auth.uid() AND scope = 'personal') OR public.is_admin(auth.uid()));

CREATE INDEX idx_comp_user ON public.member_compensations(user_id);
CREATE INDEX idx_payroll_user ON public.payroll_entries(user_id);
CREATE INDEX idx_bonus_user ON public.bonus_awards(user_id);
CREATE INDEX idx_inv_owner ON public.investments(owner_id);

CREATE TRIGGER trg_member_compensations_updated BEFORE UPDATE ON public.member_compensations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bonus_rules_updated BEFORE UPDATE ON public.bonus_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bonus_awards_updated BEFORE UPDATE ON public.bonus_awards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_payroll_entries_updated BEFORE UPDATE ON public.payroll_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_investments_updated BEFORE UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Avisos internos: escrita apenas para administradores
DROP POLICY IF EXISTS "internal_notices_write" ON public.internal_notices;
DROP POLICY IF EXISTS "internal_notices_update" ON public.internal_notices;
CREATE POLICY "internal_notices_admin_insert" ON public.internal_notices FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "internal_notices_admin_update" ON public.internal_notices FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));