CREATE TABLE public.profit_withdrawals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 share_id uuid NOT NULL REFERENCES public.profit_shares(id) ON DELETE RESTRICT,
 withdrawn_at timestamptz NOT NULL,
 amount numeric NOT NULL CHECK (amount > 0),
 currency text NOT NULL CHECK (currency IN ('USD','BRL','PYG')),
 amount_usd numeric NOT NULL CHECK (amount_usd > 0),
 notes text,
 status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','cancelado')),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
 canceled_at timestamptz,
 canceled_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profit_withdrawals_share_date ON public.profit_withdrawals(share_id, withdrawn_at);
ALTER TABLE public.profit_withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profit_withdrawals FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profit_withdrawals TO authenticated;
GRANT ALL ON public.profit_withdrawals TO service_role;
CREATE POLICY withdrawals_admin_read ON public.profit_withdrawals FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));
CREATE POLICY withdrawals_admin_insert ON public.profit_withdrawals FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) AND created_by = auth.uid());
CREATE POLICY withdrawals_admin_update ON public.profit_withdrawals FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE FUNCTION public.guard_profit_share_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(62639,1);
 IF NEW.percent <= 0 OR NEW.percent > 100 OR NEW.percent IS NULL THEN
  RAISE EXCEPTION 'Defina um percentual maior que zero e até 100.';
 END IF;
 IF NEW.active AND EXISTS (SELECT 1 FROM public.profit_shares s WHERE s.active AND s.id <> NEW.id
   AND ((s.product_id IS NULL) <> (NEW.product_id IS NULL))) THEN
  RAISE EXCEPTION 'Use divisão geral ou por categoria para não distribuir o mesmo lucro duas vezes.';
 END IF;
 IF NEW.active AND NEW.percent + coalesce((SELECT sum(s.percent) FROM public.profit_shares s
   WHERE s.active AND s.id <> NEW.id AND s.product_id IS NOT DISTINCT FROM NEW.product_id),0) > 100 THEN
  RAISE EXCEPTION 'A participação desta divisão não pode ultrapassar 100%%.';
 END IF;
 IF TG_OP = 'UPDATE'  AND (NEW.percent IS DISTINCT FROM OLD.percent OR NEW.product_id IS DISTINCT FROM OLD.product_id)
 AND EXISTS (SELECT 1 FROM public.profit_withdrawals WHERE share_id = OLD.id) THEN
  RAISE EXCEPTION 'Esta divisão já tem retiradas. Preserve o percentual e a categoria para manter o histórico.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER profit_share_preserve_history BEFORE INSERT OR UPDATE ON public.profit_shares
FOR EACH ROW EXECUTE FUNCTION public.guard_profit_share_history();
CREATE FUNCTION public.guard_profit_withdrawal_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF NEW.share_id IS DISTINCT FROM OLD.share_id OR NEW.amount IS DISTINCT FROM OLD.amount
 OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.amount_usd IS DISTINCT FROM OLD.amount_usd
 OR NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
  RAISE EXCEPTION 'Preserve o histórico: cancele a retirada e registre uma nova para corrigir seus dados.';
 END IF;
 IF OLD.status = 'cancelado' AND NEW.status <> OLD.status THEN
  RAISE EXCEPTION 'Uma retirada cancelada não pode ser reativada. Registre uma nova retirada.';
 END IF;
 IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' THEN
  NEW.canceled_at := now(); NEW.canceled_by := auth.uid();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER withdrawal_preserve_history BEFORE UPDATE ON public.profit_withdrawals
FOR EACH ROW EXECUTE FUNCTION public.guard_profit_withdrawal_history();
NOTIFY pgrst, 'reload schema';
