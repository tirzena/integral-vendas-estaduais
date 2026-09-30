-- Regras de bonificacao definidas pelo fornecedor ou administracao.
CREATE TABLE IF NOT EXISTS public.supplier_user_assignments (
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id,user_id),
  UNIQUE (user_id)
);
ALTER TABLE public.supplier_user_assignments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.supplier_user_assignments TO authenticated;
GRANT ALL ON public.supplier_user_assignments TO service_role;
DROP POLICY IF EXISTS supplier_user_assignments_select ON public.supplier_user_assignments;
CREATE POLICY supplier_user_assignments_select ON public.supplier_user_assignments FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.app_has_cap(auth.uid(),'manage_suppliers'));
DROP POLICY IF EXISTS supplier_user_assignments_manage ON public.supplier_user_assignments;
CREATE POLICY supplier_user_assignments_manage ON public.supplier_user_assignments FOR ALL TO authenticated
USING (public.app_has_cap(auth.uid(),'manage_suppliers'))
WITH CHECK (public.app_has_cap(auth.uid(),'manage_suppliers'));

CREATE TABLE IF NOT EXISTS public.supplier_bonus_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('quantidade','percentual','valor')),
  value numeric(14,3) NOT NULL CHECK (value>=0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_bonus_policy_scope_uq
ON public.supplier_bonus_policies(supplier_id,coalesce(item_id,'00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE public.supplier_bonus_policies ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.supplier_bonus_policies TO authenticated;
GRANT ALL ON public.supplier_bonus_policies TO service_role;
DROP POLICY IF EXISTS supplier_bonus_policies_select ON public.supplier_bonus_policies;
CREATE POLICY supplier_bonus_policies_select ON public.supplier_bonus_policies FOR SELECT TO authenticated
USING (
  public.app_has_cap(auth.uid(),'manage_suppliers') OR EXISTS (
    SELECT 1 FROM public.supplier_user_assignments sua
    WHERE sua.supplier_id=supplier_bonus_policies.supplier_id AND sua.user_id=auth.uid()
  )
);
DROP POLICY IF EXISTS supplier_bonus_policies_manage ON public.supplier_bonus_policies;
CREATE POLICY supplier_bonus_policies_manage ON public.supplier_bonus_policies FOR ALL TO authenticated
USING (
  public.app_has_cap(auth.uid(),'manage_suppliers') OR EXISTS (
    SELECT 1 FROM public.supplier_user_assignments sua
    WHERE sua.supplier_id=supplier_bonus_policies.supplier_id AND sua.user_id=auth.uid()
  )
)
WITH CHECK (
  public.app_has_cap(auth.uid(),'manage_suppliers') OR EXISTS (
    SELECT 1 FROM public.supplier_user_assignments sua
    WHERE sua.supplier_id=supplier_bonus_policies.supplier_id AND sua.user_id=auth.uid()
  )
);

-- Compras no estoque principal e transferencias internas sem duplicar custo.
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS source_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_cost numeric(14,2),
  ADD COLUMN IF NOT EXISTS freight_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variable_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_quantity numeric(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency public.currency_code,
  ADD COLUMN IF NOT EXISTS payable_id uuid REFERENCES public.accounts_payable(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS variable_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchandise_cost numeric(14,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_source_warehouse
  ON public.inventory_movements(source_warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_target_warehouse
  ON public.inventory_movements(target_warehouse_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.inventory_replenish(
  p_target_warehouse_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_bonus_quantity numeric DEFAULT 0,
  p_min_quantity numeric DEFAULT 0,
  p_location text DEFAULT NULL,
  p_source_warehouse_id uuid DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL,
  p_freight_cost numeric DEFAULT 0,
  p_variable_cost numeric DEFAULT 0,
  p_currency public.currency_code DEFAULT 'USD',
  p_payment_status text DEFAULT 'pendente'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  target public.warehouses%ROWTYPE;
  source public.warehouses%ROWTYPE;
  item public.inventory_items%ROWTYPE;
  target_balance public.warehouse_inventory%ROWTYPE;
  source_balance public.warehouse_inventory%ROWTYPE;
  source_id uuid;
  purchase_value numeric;
  grand_total numeric;
  new_cost numeric;
  payable_id uuid;
  applied_bonus numeric := coalesce(p_bonus_quantity, 0);
  bonus_policy public.supplier_bonus_policies%ROWTYPE;
BEGIN
  IF uid IS NULL OR NOT public.app_has_cap(uid, 'inventory_manage') THEN
    RAISE EXCEPTION 'Sem permissão para movimentar o estoque.';
  END IF;
  IF coalesce(p_quantity, 0) <= 0 THEN RAISE EXCEPTION 'Informe uma quantidade maior que zero.'; END IF;
  IF coalesce(p_bonus_quantity, 0) < 0 THEN
    RAISE EXCEPTION 'A bonificação não pode ser negativa.';
  END IF;
  IF coalesce(p_min_quantity, 0) < 0 OR coalesce(p_freight_cost, 0) < 0 OR coalesce(p_variable_cost, 0) < 0 THEN
    RAISE EXCEPTION 'Quantidade mínima e custos não podem ser negativos.';
  END IF;

  SELECT * INTO target FROM public.warehouses WHERE id = p_target_warehouse_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estoque de destino inválido ou inativo.'; END IF;
  SELECT * INTO item FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.'; END IF;

  SELECT * INTO target_balance FROM public.warehouse_inventory
   WHERE warehouse_id = target.id AND item_id = item.id FOR UPDATE;

  IF target.level = 'principal' THEN
    IF coalesce(p_unit_cost, 0) <= 0 THEN RAISE EXCEPTION 'Informe o custo unitário da compra.'; END IF;
    IF applied_bonus = 0 AND item.supplier_id IS NOT NULL THEN
      SELECT * INTO bonus_policy
      FROM public.supplier_bonus_policies bp
      WHERE bp.supplier_id=item.supplier_id
        AND bp.is_active
        AND (bp.item_id=item.id OR bp.item_id IS NULL)
      ORDER BY (bp.item_id IS NOT NULL) DESC
      LIMIT 1;
      IF FOUND THEN
        applied_bonus:=CASE bonus_policy.mode
          WHEN 'quantidade' THEN least(p_quantity,bonus_policy.value)
          WHEN 'percentual' THEN least(p_quantity,round(p_quantity*bonus_policy.value/100,3))
          WHEN 'valor' THEN least(p_quantity,floor(bonus_policy.value/p_unit_cost))
          ELSE 0
        END;
      END IF;
    END IF;
    IF applied_bonus > p_quantity THEN
      RAISE EXCEPTION 'A bonificação não pode superar a quantidade recebida.';
    END IF;
    IF p_payment_status NOT IN ('pendente', 'pago') THEN RAISE EXCEPTION 'Situação financeira inválida.'; END IF;
    IF coalesce(target_balance.quantity, 0) > 0 AND item.currency <> p_currency THEN
      RAISE EXCEPTION 'Use a moeda de custo já cadastrada para manter o custo médio correto.';
    END IF;

    purchase_value := round((p_quantity - applied_bonus) * p_unit_cost, 2);
    grand_total := round(purchase_value + coalesce(p_freight_cost, 0) + coalesce(p_variable_cost, 0), 2);
    new_cost := round(
      ((coalesce(target_balance.quantity, 0) * coalesce(item.cost, 0)) + purchase_value)
      / nullif(coalesce(target_balance.quantity, 0) + p_quantity, 0), 2
    );

    INSERT INTO public.warehouse_inventory(warehouse_id, item_id, quantity, reserved, min_quantity, location)
    VALUES(target.id, item.id, p_quantity, 0, coalesce(p_min_quantity, 0), nullif(btrim(p_location), ''))
    ON CONFLICT (warehouse_id, item_id) DO UPDATE SET
      quantity = public.warehouse_inventory.quantity + excluded.quantity,
      min_quantity = excluded.min_quantity,
      location = coalesce(excluded.location, public.warehouse_inventory.location),
      updated_at = now();

    UPDATE public.inventory_items SET cost = new_cost, currency = p_currency, updated_at = now() WHERE id = item.id;

    INSERT INTO public.accounts_payable(
      description, supplier_id, product_id, amount, currency, due_date, paid_at,
      category, cost_center, status
    ) VALUES (
      'Compra de estoque: ' || item.name, item.supplier_id, item.product_id, grand_total, p_currency,
      current_date, CASE WHEN p_payment_status = 'pago' THEN current_date ELSE NULL END,
      'Compra de estoque', target.name, p_payment_status
    ) RETURNING id INTO payable_id;

    INSERT INTO public.inventory_movements(
      item_id, user_id, movement_type, quantity, reason, source_warehouse_id,
      target_warehouse_id, unit_cost, freight_cost, variable_cost, total_cost, bonus_quantity, currency, payable_id
    ) VALUES (
      item.id, uid, 'entrada_compra', p_quantity, 'Compra para o estoque principal', NULL,
      target.id, p_unit_cost, coalesce(p_freight_cost, 0), coalesce(p_variable_cost, 0), grand_total,
      applied_bonus,
      p_currency, payable_id
    );

    RETURN jsonb_build_object('type', 'purchase', 'warehouse_id', target.id, 'item_id', item.id,
      'quantity', p_quantity, 'bonus_quantity', applied_bonus,
      'paid_quantity', p_quantity - applied_bonus,
      'total_cost', grand_total, 'payable_id', payable_id);
  END IF;

  IF applied_bonus <> 0 THEN
    RAISE EXCEPTION 'Bonificação só pode ser registrada na compra do estoque principal.';
  END IF;

  source_id := coalesce(p_source_warehouse_id, target.parent_id);
  IF source_id IS NULL OR source_id = target.id THEN RAISE EXCEPTION 'Escolha um estoque de origem válido.'; END IF;
  SELECT * INTO source FROM public.warehouses WHERE id = source_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estoque de origem inválido ou inativo.'; END IF;
  SELECT * INTO source_balance FROM public.warehouse_inventory
   WHERE warehouse_id = source.id AND item_id = item.id FOR UPDATE;
  IF NOT FOUND OR source_balance.quantity - source_balance.reserved < p_quantity THEN
    RAISE EXCEPTION 'O estoque de origem não possui saldo disponível suficiente.';
  END IF;

  UPDATE public.warehouse_inventory SET quantity = quantity - p_quantity, updated_at = now()
   WHERE warehouse_id = source.id AND item_id = item.id;
  INSERT INTO public.warehouse_inventory(warehouse_id, item_id, quantity, reserved, min_quantity, location)
  VALUES(target.id, item.id, p_quantity, 0, coalesce(p_min_quantity, 0), nullif(btrim(p_location), ''))
  ON CONFLICT (warehouse_id, item_id) DO UPDATE SET
    quantity = public.warehouse_inventory.quantity + excluded.quantity,
    min_quantity = excluded.min_quantity,
    location = coalesce(excluded.location, public.warehouse_inventory.location),
    updated_at = now();

  INSERT INTO public.inventory_movements(
    item_id, user_id, movement_type, quantity, reason, source_warehouse_id, target_warehouse_id,
    unit_cost, total_cost, currency
  ) VALUES
    (item.id, uid, 'transferencia_saida', -p_quantity, 'Transferência entre estoques', source.id, target.id, item.cost, 0, item.currency),
    (item.id, uid, 'transferencia_entrada', p_quantity, 'Transferência entre estoques', source.id, target.id, item.cost, 0, item.currency);

  RETURN jsonb_build_object('type', 'transfer', 'source_warehouse_id', source.id,
    'target_warehouse_id', target.id, 'item_id', item.id, 'quantity', p_quantity);
END
$$;

REVOKE ALL ON FUNCTION public.inventory_replenish(uuid,uuid,numeric,numeric,numeric,text,uuid,numeric,numeric,numeric,public.currency_code,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_replenish(uuid,uuid,numeric,numeric,numeric,text,uuid,numeric,numeric,numeric,public.currency_code,text) TO authenticated;

-- Mantem o custo do pedido e o lucro bruto atualizados a partir do custo unitario do catalogo.
CREATE OR REPLACE FUNCTION public.sales_recalculate_order_cost(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_currency public.currency_code;
  order_created_at timestamptz;
  order_rates jsonb;
  cost_in_order_currency numeric;
  cost_brl numeric;
  cost_usd numeric;
  conversion_rate numeric;
BEGIN
  SELECT currency, created_at, exchange_rates_snapshot
    INTO order_currency, order_created_at, order_rates
    FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Usa a cotacao congelada na criacao do pedido; o historico nao muda com a cotacao atual.
  SELECT coalesce(sum(oi.quantity * coalesce(ii.cost, 0) *
    CASE
      WHEN ii.currency = order_currency THEN 1
      WHEN nullif((order_rates ->> ii.currency::text)::numeric, 0) IS NOT NULL
        THEN 1 / nullif((order_rates ->> ii.currency::text)::numeric, 0)
      ELSE coalesce(r.rate, 0)
    END), 0)
    INTO cost_in_order_currency
    FROM public.order_items oi
    LEFT JOIN public.inventory_items ii ON ii.id = oi.item_id
    LEFT JOIN LATERAL public.financial_rate_at(ii.currency, order_currency, order_created_at) r ON true
   WHERE oi.order_id = p_order_id;

  conversion_rate := nullif((order_rates ->> 'BRL')::numeric, 0);
  IF conversion_rate IS NULL THEN
    SELECT r.rate INTO conversion_rate FROM public.financial_rate_at(order_currency, 'BRL', order_created_at) r LIMIT 1;
  END IF;
  cost_brl := round(cost_in_order_currency * coalesce(conversion_rate, CASE WHEN order_currency = 'BRL' THEN 1 ELSE 0 END), 2);
  conversion_rate := nullif((order_rates ->> 'USD')::numeric, 0);
  IF conversion_rate IS NULL THEN
    SELECT r.rate INTO conversion_rate FROM public.financial_rate_at(order_currency, 'USD', order_created_at) r LIMIT 1;
  END IF;
  cost_usd := round(cost_in_order_currency * coalesce(conversion_rate, CASE WHEN order_currency = 'USD' THEN 1 ELSE 0 END), 2);

  UPDATE public.orders SET
    merchandise_cost = round(cost_in_order_currency, 2),
    total_cost_brl = cost_brl,
    total_cost_usd = cost_usd,
    gross_margin = round(total - cost_in_order_currency - coalesce(shipping_cost, 0) - coalesce(variable_cost, 0), 2)
  WHERE id = p_order_id;
END
$$;

REVOKE ALL ON FUNCTION public.sales_recalculate_order_cost(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_recalculate_order_cost(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_recalculate_order_cost_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.sales_recalculate_order_cost(CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END);
  RETURN coalesce(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS trg_order_items_recalculate_cost ON public.order_items;
CREATE TRIGGER trg_order_items_recalculate_cost
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.sales_recalculate_order_cost_trigger();

CREATE OR REPLACE FUNCTION public.sales_recalculate_order_cost_on_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.sales_recalculate_order_cost(NEW.id);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_orders_recalculate_cost ON public.orders;
CREATE TRIGGER trg_orders_recalculate_cost
AFTER UPDATE OF total, shipping_cost, variable_cost ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sales_recalculate_order_cost_on_order();

DO $$ DECLARE row record; BEGIN
  FOR row IN SELECT id FROM public.orders LOOP
    PERFORM public.sales_recalculate_order_cost(row.id);
  END LOOP;
END $$;

-- Recibo emitido pelo sistema para pagamentos em dinheiro.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS receipt_token uuid DEFAULT gen_random_uuid();
UPDATE public.payments SET receipt_token = gen_random_uuid() WHERE receipt_token IS NULL;
ALTER TABLE public.payments ALTER COLUMN receipt_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_receipt_token_uq ON public.payments(receipt_token);

CREATE OR REPLACE FUNCTION public.sales_register_payment(
  p_order_id uuid,p_amount numeric,p_method text,p_proof_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; proof public.order_payment_proofs%ROWTYPE;
  paid_total numeric:=0; remaining numeric:=0; new_payment_id uuid; root_id uuid; before_snapshot jsonb;
  next_stage text; receipt uuid; is_cash boolean:=lower(btrim(coalesce(p_method,'')))='dinheiro';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.status='cancelado' OR o.deleted_at IS NOT NULL OR NOT public.sales_can_manage(uid,o.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para registrar pagamento neste pedido.';
  END IF;
  IF NOT is_cash THEN
    SELECT * INTO proof FROM public.order_payment_proofs WHERE id=p_proof_id AND order_id=o.id AND payment_id IS NULL FOR UPDATE;
    IF proof.id IS NULL THEN RAISE EXCEPTION 'Selecione um comprovante ainda não utilizado.'; END IF;
  END IF;
  IF coalesce(p_amount,0)<=0 OR coalesce(btrim(p_method),'')='' THEN RAISE EXCEPTION 'Informe valor e forma de pagamento.'; END IF;
  SELECT coalesce(sum(amount),0) INTO paid_total FROM public.payments WHERE order_id=o.id AND status='pago';
  remaining:=round(o.total-paid_total,2);
  IF round(p_amount,2)>remaining THEN RAISE EXCEPTION 'O pagamento é maior que o saldo restante.'; END IF;
  before_snapshot:=public.sales_order_snapshot(o.id); root_id:=coalesce(o.root_order_id,o.id);
  IF o.stock_state='reservado' THEN PERFORM public.sales_apply_stock(o.id,'baixar_reservado',uid); END IF;
  INSERT INTO public.payments(order_id,amount,currency,method,paid_at,installment,status)
    VALUES(o.id,round(p_amount,2),o.currency,btrim(p_method),current_date,1,'pago')
    RETURNING id,receipt_token INTO new_payment_id,receipt;
  IF is_cash THEN
    INSERT INTO public.order_payment_proofs(order_id,payment_id,proof_type,file_path,file_name,uploaded_by)
    VALUES(o.id,new_payment_id,'recibo_sistema',receipt::text,
      'Recibo-pedido-'||lpad(coalesce(o.number,0)::text,2,'0')||'.pdf',uid);
  ELSE
    UPDATE public.order_payment_proofs SET payment_id=new_payment_id WHERE id=proof.id;
  END IF;
  paid_total:=round(paid_total+p_amount,2); remaining:=greatest(0,round(o.total-paid_total,2));
  next_stage:=CASE WHEN remaining=0 THEN 'vendido' ELSE 'pagamento_parcial' END;
  UPDATE public.orders SET kind='venda',stock_state='baixado',amount_paid=paid_total,amount_receivable=remaining,
    payment_status=CASE WHEN remaining=0 THEN 'pago' ELSE 'parcial' END,
    workflow_stage=next_stage,status='faturado' WHERE id=o.id;
  IF EXISTS(SELECT 1 FROM public.accounts_receivable WHERE order_id=o.id AND status<>'cancelado') THEN
    UPDATE public.accounts_receivable SET amount=remaining,status=CASE WHEN remaining=0 THEN 'pago' ELSE 'pendente' END,
      paid_at=CASE WHEN remaining=0 THEN current_date ELSE NULL END,updated_at=now() WHERE order_id=o.id AND status<>'cancelado';
  ELSIF remaining>0 THEN
    INSERT INTO public.accounts_receivable(description,customer_id,product_id,order_id,amount,currency,due_date,status)
      VALUES('Saldo do pedido '||coalesce(o.number::text,o.id::text),o.customer_id,o.product_id,o.id,remaining,o.currency,current_date,'pendente');
  END IF;
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
    VALUES(o.id,root_id,o.revision_no,'pagamento_registrado',uid,
      'Pagamento registrado: '||round(p_amount,2)||' '||o.currency||'. Saldo: '||remaining||' '||o.currency,
      before_snapshot,public.sales_order_snapshot(o.id));
  RETURN jsonb_build_object('id',o.id,'payment_id',new_payment_id,'receipt_token',CASE WHEN is_cash THEN receipt ELSE NULL END,
    'paid',paid_total,'remaining',remaining,'stage',next_stage);
END $$;
REVOKE ALL ON FUNCTION public.sales_register_payment(uuid,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_register_payment(uuid,numeric,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.public_payment_receipt(p_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'payment_id',p.id,'amount',p.amount,'currency',p.currency,'method',p.method,
    'paid_at',p.paid_at,'created_at',p.created_at,'order_number',o.number,
    'customer_name',c.name,'recipient_name',o.delivery_recipient_name,
    'seller_name',seller.full_name
  )
  FROM public.payments p
  JOIN public.orders o ON o.id=p.order_id
  LEFT JOIN public.customers c ON c.id=o.customer_id
  LEFT JOIN public.profiles seller ON seller.id=o.seller_id
  WHERE p.receipt_token=p_token AND p.status='pago'
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.public_payment_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_payment_receipt(uuid) TO anon,authenticated;
