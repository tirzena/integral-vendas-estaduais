-- Ordens de compra administrativas, pagamentos parciais e entrada no estoque principal.
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number integer NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  purchase_date date NOT NULL DEFAULT current_date,
  due_date date,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  merchandise_total numeric(16,2) NOT NULL DEFAULT 0 CHECK (merchandise_total >= 0),
  freight_cost numeric(16,2) NOT NULL DEFAULT 0 CHECK (freight_cost >= 0),
  variable_cost numeric(16,2) NOT NULL DEFAULT 0 CHECK (variable_cost >= 0),
  total numeric(16,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  amount_paid numeric(16,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_payable numeric(16,2) NOT NULL DEFAULT 0 CHECK (amount_payable >= 0),
  payment_status text NOT NULL DEFAULT 'pendente'
    CHECK (payment_status IN ('pendente','parcial','pago','cancelado')),
  status text NOT NULL DEFAULT 'confirmada'
    CHECK (status IN ('confirmada','cancelada')),
  notes text,
  account_payable_id uuid REFERENCES public.accounts_payable(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual','sales_order')),
  source_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  source_root_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual','sales_order')),
  ADD COLUMN IF NOT EXISTS source_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_root_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  description text NOT NULL,
  sku text,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  bonus_quantity numeric(14,3) NOT NULL DEFAULT 0
    CHECK (bonus_quantity >= 0 AND bonus_quantity <= quantity),
  payable_quantity numeric(14,3) NOT NULL CHECK (payable_quantity >= 0),
  unit_cost numeric(16,4) NOT NULL CHECK (unit_cost > 0),
  total numeric(16,2) NOT NULL CHECK (total >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.purchase_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  installment integer NOT NULL CHECK (installment > 0),
  amount numeric(16,2) NOT NULL CHECK (amount > 0),
  currency public.currency_code NOT NULL,
  method text NOT NULL,
  paid_at date NOT NULL DEFAULT current_date,
  reference text,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, installment)
);

CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx
  ON public.purchase_orders(supplier_id, purchase_date DESC, number DESC);
CREATE INDEX IF NOT EXISTS purchase_orders_status_idx
  ON public.purchase_orders(status, payment_status, purchase_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_sales_source_uq
  ON public.purchase_orders(source_root_order_id, supplier_id, currency)
  WHERE source_type = 'sales_order';
CREATE INDEX IF NOT EXISTS purchase_order_items_order_idx
  ON public.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS purchase_payments_order_idx
  ON public.purchase_payments(purchase_order_id, installment);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_payments ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.purchase_orders, public.purchase_order_items, public.purchase_payments TO authenticated;
GRANT ALL ON public.purchase_orders, public.purchase_order_items, public.purchase_payments TO service_role;

DROP POLICY IF EXISTS purchase_orders_admin_read ON public.purchase_orders;
CREATE POLICY purchase_orders_admin_read ON public.purchase_orders FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS purchase_order_items_admin_read ON public.purchase_order_items;
CREATE POLICY purchase_order_items_admin_read ON public.purchase_order_items FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS purchase_payments_admin_read ON public.purchase_payments;
CREATE POLICY purchase_payments_admin_read ON public.purchase_payments FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

INSERT INTO public.document_counters(scope, last_number)
VALUES ('purchase_orders', COALESCE((SELECT max(number) FROM public.purchase_orders), 0))
ON CONFLICT (scope) DO UPDATE SET
  last_number = GREATEST(public.document_counters.last_number, EXCLUDED.last_number),
  updated_at = now();

CREATE OR REPLACE FUNCTION public.purchase_management_options()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Somente administradores podem acessar compras.';
  END IF;

  RETURN jsonb_build_object(
    'suppliers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'document', s.document,
        'contact_name', s.contact_name, 'phone', s.phone, 'email', s.email,
        'country', s.country, 'address', s.address
      ) ORDER BY s.name)
      FROM public.suppliers s
      WHERE s.deleted_at IS NULL AND s.status = 'ativo'
    ), '[]'::jsonb),
    'warehouses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name, 'city', w.city, 'state', w.state
      ) ORDER BY w.name)
      FROM public.warehouses w
      WHERE w.is_active AND w.level = 'principal'
    ), '[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'supplier_id', i.supplier_id, 'name', i.name,
        'sku', i.sku, 'cost', i.cost, 'currency', i.currency
      ) ORDER BY i.name)
      FROM public.inventory_items i
      WHERE i.supplier_id IS NOT NULL
    ), '[]'::jsonb)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.purchases_for_management()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Somente administradores podem acessar compras.';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'number')::integer DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT jsonb_build_object(
      'id', po.id, 'number', po.number, 'purchase_date', po.purchase_date,
      'due_date', po.due_date, 'currency', po.currency,
      'merchandise_total', po.merchandise_total, 'freight_cost', po.freight_cost,
      'variable_cost', po.variable_cost, 'total', po.total,
      'amount_paid', po.amount_paid, 'amount_payable', po.amount_payable,
      'payment_status', po.payment_status, 'status', po.status,
      'source_type', po.source_type, 'source_order_id', po.source_order_id,
      'source_root_order_id', po.source_root_order_id,
      'source_order', CASE WHEN source_order.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', source_order.id, 'number', source_order.number,
        'revision_no', source_order.revision_no
      ) END,
      'notes', po.notes, 'created_at', po.created_at,
      'supplier', jsonb_build_object(
        'id', s.id, 'name', s.name, 'document', s.document,
        'contact_name', s.contact_name, 'phone', s.phone, 'email', s.email,
        'country', s.country, 'address', s.address
      ),
      'buyer', jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email),
      'warehouse', jsonb_build_object(
        'id', w.id, 'name', w.name, 'city', w.city, 'state', w.state, 'address', w.address
      ),
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', poi.id, 'item_id', poi.item_id, 'description', poi.description,
          'sku', poi.sku, 'quantity', poi.quantity,
          'bonus_quantity', poi.bonus_quantity, 'payable_quantity', poi.payable_quantity,
          'unit_cost', poi.unit_cost, 'total', poi.total
        ) ORDER BY poi.created_at)
        FROM public.purchase_order_items poi
        WHERE poi.purchase_order_id = po.id AND poi.active
      ), '[]'::jsonb),
      'payments', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', pp.id, 'installment', pp.installment, 'amount', pp.amount,
          'currency', pp.currency, 'method', pp.method, 'paid_at', pp.paid_at,
          'reference', pp.reference, 'notes', pp.notes,
          'created_by', pp.created_by, 'created_by_name', cp.full_name,
          'created_at', pp.created_at
        ) ORDER BY pp.installment)
        FROM public.purchase_payments pp
        LEFT JOIN public.profiles cp ON cp.id = pp.created_by
        WHERE pp.purchase_order_id = po.id
      ), '[]'::jsonb)
    ) AS row_data
    FROM public.purchase_orders po
    JOIN public.suppliers s ON s.id = po.supplier_id
    JOIN public.warehouses w ON w.id = po.warehouse_id
    LEFT JOIN public.profiles p ON p.id = po.created_by
    LEFT JOIN public.orders source_order ON source_order.id = po.source_order_id
  ) rows;

  RETURN result;
END
$$;

CREATE OR REPLACE FUNCTION public.purchase_create(
  p_supplier_id uuid,
  p_warehouse_id uuid,
  p_currency public.currency_code,
  p_purchase_date date,
  p_due_date date,
  p_items jsonb,
  p_freight_cost numeric DEFAULT 0,
  p_variable_cost numeric DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  purchase_id uuid;
  v_payable_id uuid;
  purchase_number integer;
  line jsonb;
  item public.inventory_items%ROWTYPE;
  balance public.warehouse_inventory%ROWTYPE;
  quantity numeric;
  bonus numeric;
  unit_cost numeric;
  v_payable_quantity numeric;
  line_total numeric;
  v_merchandise_total numeric := 0;
  grand_total numeric;
  new_cost numeric;
BEGIN
  IF uid IS NULL OR NOT public.is_admin(uid) THEN
    RAISE EXCEPTION 'Somente administradores podem registrar compras.';
  END IF;
  IF p_supplier_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = p_supplier_id AND s.deleted_at IS NULL AND s.status = 'ativo'
  ) THEN RAISE EXCEPTION 'Escolha um fornecedor ativo.'; END IF;
  IF p_warehouse_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = p_warehouse_id AND w.is_active AND w.level = 'principal'
  ) THEN RAISE EXCEPTION 'Escolha um estoque principal ativo.'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos um produto à compra.';
  END IF;
  IF COALESCE(p_freight_cost, 0) < 0 OR COALESCE(p_variable_cost, 0) < 0 THEN
    RAISE EXCEPTION 'Os custos adicionais não podem ser negativos.';
  END IF;

  purchase_number := public.sales_next_number('purchase_orders');
  INSERT INTO public.purchase_orders(
    number, supplier_id, warehouse_id, created_by, purchase_date, due_date,
    currency, freight_cost, variable_cost, notes
  ) VALUES (
    purchase_number, p_supplier_id, p_warehouse_id, uid,
    COALESCE(p_purchase_date, current_date), p_due_date, COALESCE(p_currency, 'USD'),
    COALESCE(p_freight_cost, 0), COALESCE(p_variable_cost, 0), NULLIF(btrim(p_notes), '')
  ) RETURNING id INTO purchase_id;

  FOR line IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    quantity := COALESCE((line->>'quantity')::numeric, 0);
    bonus := COALESCE((line->>'bonus_quantity')::numeric, 0);
    unit_cost := COALESCE((line->>'unit_cost')::numeric, 0);
    IF quantity <= 0 OR unit_cost <= 0 THEN
      RAISE EXCEPTION 'Informe quantidade e custo unitário válidos em todos os produtos.';
    END IF;
    IF bonus < 0 OR bonus > quantity THEN
      RAISE EXCEPTION 'A bonificação deve estar entre zero e a quantidade recebida.';
    END IF;

    SELECT * INTO item FROM public.inventory_items
    WHERE id = (line->>'item_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto da compra não encontrado.'; END IF;
    IF item.supplier_id IS DISTINCT FROM p_supplier_id THEN
      RAISE EXCEPTION 'O produto % não pertence ao fornecedor escolhido.', item.name;
    END IF;

    SELECT * INTO balance FROM public.warehouse_inventory
    WHERE warehouse_id = p_warehouse_id AND item_id = item.id FOR UPDATE;
    IF FOUND AND COALESCE(balance.quantity, 0) > 0 AND item.currency <> p_currency THEN
      RAISE EXCEPTION 'Use a moeda de custo já cadastrada para o produto %.', item.name;
    END IF;

    payable_quantity := quantity - bonus;
    line_total := round(payable_quantity * unit_cost, 2);
    v_merchandise_total := v_merchandise_total + line_total;
    new_cost := round(
      ((COALESCE(balance.quantity, 0) * COALESCE(item.cost, 0)) + line_total)
      / NULLIF(COALESCE(balance.quantity, 0) + quantity, 0), 4
    );

    INSERT INTO public.purchase_order_items(
      purchase_order_id, item_id, description, sku, quantity,
      bonus_quantity, payable_quantity, unit_cost, total
    ) VALUES (
      purchase_id, item.id, item.name, item.sku, quantity,
      bonus, payable_quantity, unit_cost, line_total
    );

    INSERT INTO public.warehouse_inventory(warehouse_id, item_id, quantity, reserved)
    VALUES(p_warehouse_id, item.id, quantity, 0)
    ON CONFLICT (warehouse_id, item_id) DO UPDATE SET
      quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
      updated_at = now();

    UPDATE public.inventory_items SET
      cost = new_cost, currency = p_currency, updated_at = now()
    WHERE id = item.id;

    INSERT INTO public.inventory_movements(
      item_id, user_id, movement_type, quantity, reason, target_warehouse_id,
      unit_cost, total_cost, bonus_quantity, currency,
      document_type, document_id, document_number
    ) VALUES (
      item.id, uid, 'entrada_compra', quantity,
      'Ordem de compra #' || lpad(purchase_number::text, 2, '0'), p_warehouse_id,
      unit_cost, line_total, bonus, p_currency,
      'purchase_order', purchase_id, purchase_number
    );
  END LOOP;

  grand_total := round(v_merchandise_total + COALESCE(p_freight_cost, 0) + COALESCE(p_variable_cost, 0), 2);
  INSERT INTO public.accounts_payable(
    description, supplier_id, amount, currency, due_date,
    category, cost_center, status
  ) VALUES (
    'Ordem de compra #' || lpad(purchase_number::text, 2, '0'), p_supplier_id,
    grand_total, p_currency, COALESCE(p_due_date, p_purchase_date, current_date),
    'Compra de estoque', (SELECT w.name FROM public.warehouses w WHERE w.id = p_warehouse_id),
    'pendente'
  ) RETURNING id INTO v_payable_id;

  UPDATE public.purchase_orders SET
    merchandise_total = v_merchandise_total,
    total = grand_total,
    amount_payable = grand_total,
    account_payable_id = v_payable_id,
    updated_at = now()
  WHERE id = purchase_id;

  UPDATE public.inventory_movements SET payable_id = v_payable_id
  WHERE document_type = 'purchase_order' AND document_id = purchase_id;

  RETURN jsonb_build_object('id', purchase_id, 'number', purchase_number, 'total', grand_total);
END
$$;

CREATE OR REPLACE FUNCTION public.purchase_register_payment(
  p_purchase_order_id uuid,
  p_amount numeric,
  p_method text,
  p_paid_at date,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  purchase public.purchase_orders%ROWTYPE;
  next_installment integer;
  new_paid numeric;
  remaining numeric;
  new_status text;
BEGIN
  IF uid IS NULL OR NOT public.is_admin(uid) THEN
    RAISE EXCEPTION 'Somente administradores podem registrar pagamentos de compras.';
  END IF;
  SELECT * INTO purchase FROM public.purchase_orders
  WHERE id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND OR purchase.status = 'cancelada' THEN
    RAISE EXCEPTION 'Ordem de compra não encontrada ou cancelada.';
  END IF;
  IF COALESCE(p_amount, 0) <= 0 OR COALESCE(btrim(p_method), '') = '' THEN
    RAISE EXCEPTION 'Informe o valor e a forma de pagamento.';
  END IF;
  IF round(p_amount, 2) > purchase.amount_payable THEN
    RAISE EXCEPTION 'O pagamento é maior que o saldo da compra.';
  END IF;

  SELECT COALESCE(max(pp.installment), 0) + 1 INTO next_installment
  FROM public.purchase_payments pp WHERE pp.purchase_order_id = purchase.id;

  INSERT INTO public.purchase_payments(
    purchase_order_id, installment, amount, currency, method,
    paid_at, reference, notes, created_by
  ) VALUES (
    purchase.id, next_installment, round(p_amount, 2), purchase.currency, btrim(p_method),
    COALESCE(p_paid_at, current_date), NULLIF(btrim(p_reference), ''),
    NULLIF(btrim(p_notes), ''), uid
  );

  new_paid := round(purchase.amount_paid + p_amount, 2);
  remaining := greatest(0, round(purchase.total - new_paid, 2));
  new_status := CASE WHEN remaining = 0 THEN 'pago' ELSE 'parcial' END;

  UPDATE public.purchase_orders SET
    amount_paid = new_paid, amount_payable = remaining,
    payment_status = new_status, updated_at = now()
  WHERE id = purchase.id;

  UPDATE public.accounts_payable SET
    status = CASE WHEN remaining = 0 THEN 'pago' ELSE 'pendente' END,
    paid_at = CASE WHEN remaining = 0 THEN COALESCE(p_paid_at, current_date) ELSE NULL END,
    updated_at = now()
  WHERE id = purchase.account_payable_id;

  RETURN jsonb_build_object(
    'purchase_order_id', purchase.id, 'installment', next_installment,
    'amount_paid', new_paid, 'amount_payable', remaining, 'payment_status', new_status
  );
END
$$;

REVOKE ALL ON FUNCTION public.purchase_management_options() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purchases_for_management() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purchase_create(uuid,uuid,public.currency_code,date,date,jsonb,numeric,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purchase_register_payment(uuid,numeric,text,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_management_options() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchases_for_management() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_create(uuid,uuid,public.currency_code,date,date,jsonb,numeric,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_register_payment(uuid,numeric,text,date,text,text) TO authenticated;

-- Um pedido efetivo gera uma ordem de compra por fornecedor e moeda. Essa
-- ordem representa a obrigação com o fornecedor e não soma estoque novamente:
-- a entrada física continua sendo registrada pela compra manual.
CREATE OR REPLACE FUNCTION public.purchase_sync_from_sales_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sales_order public.orders%ROWTYPE;
  root_id uuid;
  main_warehouse_id uuid;
  group_row record;
  item_row record;
  policy public.supplier_bonus_policies%ROWTYPE;
  purchase_id uuid;
  payable_id uuid;
  purchase_number integer;
  bonus numeric;
  payable_quantity numeric;
  line_total numeric;
  v_merchandise_total numeric;
  paid_total numeric;
BEGIN
  SELECT * INTO sales_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  root_id := COALESCE(sales_order.root_order_id, sales_order.id);

  IF sales_order.kind <> 'venda' OR sales_order.status = 'cancelado'
    OR sales_order.deleted_at IS NOT NULL OR sales_order.superseded_at IS NOT NULL THEN
    UPDATE public.purchase_orders po SET
      status = 'cancelada', payment_status = 'cancelado', amount_payable = 0,
      updated_at = now()
    WHERE po.source_type = 'sales_order' AND po.source_root_order_id = root_id;
    UPDATE public.accounts_payable ap SET status = 'cancelado', updated_at = now()
    WHERE ap.id IN (
      SELECT po.account_payable_id FROM public.purchase_orders po
      WHERE po.source_type = 'sales_order' AND po.source_root_order_id = root_id
    );
    RETURN;
  END IF;

  SELECT w.id INTO main_warehouse_id
  FROM public.warehouses w
  WHERE w.is_active AND w.level = 'principal'
  ORDER BY CASE WHEN w.id = sales_order.warehouse_id THEN 0 ELSE 1 END, w.created_at, w.id
  LIMIT 1;
  IF main_warehouse_id IS NULL THEN RETURN; END IF;

  FOR group_row IN
    SELECT ii.supplier_id, ii.currency
    FROM public.order_items oi
    JOIN public.inventory_items ii ON ii.id = oi.item_id
    JOIN public.suppliers s ON s.id = ii.supplier_id
    WHERE oi.order_id = sales_order.id
      AND ii.supplier_id IS NOT NULL
      AND s.deleted_at IS NULL
      AND ii.cost > 0
    GROUP BY ii.supplier_id, ii.currency
  LOOP
    SELECT po.id, po.account_payable_id, po.number, po.amount_paid
      INTO purchase_id, payable_id, purchase_number, paid_total
    FROM public.purchase_orders po
    WHERE po.source_type = 'sales_order'
      AND po.source_root_order_id = root_id
      AND po.supplier_id = group_row.supplier_id
      AND po.currency = group_row.currency
    FOR UPDATE;

    IF purchase_id IS NULL THEN
      purchase_number := public.sales_next_number('purchase_orders');
      INSERT INTO public.purchase_orders(
        number, supplier_id, warehouse_id, created_by, purchase_date, due_date,
        currency, source_type, source_order_id, source_root_order_id, notes
      ) VALUES (
        purchase_number, group_row.supplier_id, main_warehouse_id, sales_order.seller_id,
        COALESCE(sales_order.order_date, current_date), current_date, group_row.currency,
        'sales_order', sales_order.id, root_id,
        'Gerada automaticamente pelo pedido #' || lpad(sales_order.number::text, 2, '0') ||
          CASE WHEN COALESCE(sales_order.revision_no, 1) > 1
            THEN '.' || (sales_order.revision_no - 1)::text ELSE '' END
      ) RETURNING id, amount_paid INTO purchase_id, paid_total;
    ELSE
      UPDATE public.purchase_orders SET
        source_order_id = sales_order.id, warehouse_id = main_warehouse_id,
        created_by = sales_order.seller_id,
        purchase_date = COALESCE(sales_order.order_date, current_date),
        status = 'confirmada', updated_at = now(),
        notes = 'Gerada automaticamente pelo pedido #' || lpad(sales_order.number::text, 2, '0') ||
          CASE WHEN COALESCE(sales_order.revision_no, 1) > 1
            THEN '.' || (sales_order.revision_no - 1)::text ELSE '' END
      WHERE id = purchase_id;
    END IF;

    UPDATE public.purchase_order_items SET active = false
    WHERE purchase_order_id = purchase_id AND active;
    v_merchandise_total := 0;
    FOR item_row IN
      SELECT ii.id, ii.name, ii.sku, ii.cost,
        sum(oi.quantity)::numeric AS quantity
      FROM public.order_items oi
      JOIN public.inventory_items ii ON ii.id = oi.item_id
      WHERE oi.order_id = sales_order.id
        AND ii.supplier_id = group_row.supplier_id
        AND ii.currency = group_row.currency
        AND ii.cost > 0
      GROUP BY ii.id, ii.name, ii.sku, ii.cost
    LOOP
      bonus := 0;
      SELECT * INTO policy
      FROM public.supplier_bonus_policies bp
      WHERE bp.supplier_id = group_row.supplier_id AND bp.is_active
        AND (bp.item_id = item_row.id OR bp.item_id IS NULL)
      ORDER BY (bp.item_id IS NOT NULL) DESC, bp.updated_at DESC
      LIMIT 1;
      IF FOUND THEN
        bonus := CASE policy.mode
          WHEN 'quantidade' THEN least(item_row.quantity, policy.value)
          WHEN 'percentual' THEN least(item_row.quantity, round(item_row.quantity * policy.value / 100, 3))
          WHEN 'valor' THEN CASE WHEN item_row.cost > 0
            THEN least(item_row.quantity, floor(policy.value / item_row.cost)) ELSE 0 END
          ELSE 0
        END;
      END IF;
      v_payable_quantity := greatest(0, item_row.quantity - bonus);
      line_total := round(v_payable_quantity * item_row.cost, 2);
      v_merchandise_total := v_merchandise_total + line_total;
      UPDATE public.purchase_order_items SET
        description = item_row.name, sku = item_row.sku, quantity = item_row.quantity,
        bonus_quantity = bonus, payable_quantity = v_payable_quantity,
        unit_cost = item_row.cost, total = line_total, active = true
      WHERE purchase_order_id = purchase_id AND item_id = item_row.id;
      IF NOT FOUND THEN
        INSERT INTO public.purchase_order_items(
          purchase_order_id, item_id, description, sku, quantity,
          bonus_quantity, payable_quantity, unit_cost, total, active
        ) VALUES (
          purchase_id, item_row.id, item_row.name, item_row.sku, item_row.quantity,
          bonus, v_payable_quantity, item_row.cost, line_total, true
        );
      END IF;
    END LOOP;

    paid_total := COALESCE(paid_total, 0);
    UPDATE public.purchase_orders SET
      merchandise_total = v_merchandise_total, total = v_merchandise_total,
      amount_payable = greatest(0, v_merchandise_total - paid_total),
      payment_status = CASE
        WHEN paid_total >= v_merchandise_total THEN 'pago'
        WHEN paid_total > 0 THEN 'parcial' ELSE 'pendente' END,
      updated_at = now()
    WHERE id = purchase_id;

    IF payable_id IS NULL THEN
      INSERT INTO public.accounts_payable(
        description, supplier_id, amount, currency, due_date, category, cost_center, status
      ) VALUES (
        'Ordem de compra #' || lpad(purchase_number::text, 2, '0') ||
          ' do pedido #' || lpad(sales_order.number::text, 2, '0'),
        group_row.supplier_id, v_merchandise_total, group_row.currency, current_date,
        'Custo de produtos vendidos',
        (SELECT w.name FROM public.warehouses w WHERE w.id = main_warehouse_id),
        CASE WHEN paid_total >= v_merchandise_total THEN 'pago' ELSE 'pendente' END
      ) RETURNING id INTO payable_id;
      UPDATE public.purchase_orders SET account_payable_id = payable_id WHERE id = purchase_id;
    ELSE
      UPDATE public.accounts_payable SET
        supplier_id = group_row.supplier_id, amount = v_merchandise_total,
        currency = group_row.currency,
        status = CASE WHEN paid_total >= v_merchandise_total THEN 'pago' ELSE 'pendente' END,
        paid_at = CASE WHEN paid_total >= v_merchandise_total THEN COALESCE(paid_at, current_date) ELSE NULL END,
        updated_at = now()
      WHERE id = payable_id;
    END IF;
  END LOOP;

  UPDATE public.purchase_orders po SET
    status = 'cancelada', payment_status = 'cancelado', amount_payable = 0, updated_at = now()
  WHERE po.source_type = 'sales_order' AND po.source_root_order_id = root_id
    AND NOT EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.inventory_items ii ON ii.id = oi.item_id
      WHERE oi.order_id = sales_order.id
        AND ii.supplier_id = po.supplier_id AND ii.currency = po.currency AND ii.cost > 0
    );
  UPDATE public.accounts_payable ap SET status = 'cancelado', updated_at = now()
  WHERE ap.id IN (
    SELECT po.account_payable_id FROM public.purchase_orders po
    WHERE po.source_type = 'sales_order' AND po.source_root_order_id = root_id
      AND po.status = 'cancelada'
  );
END
$$;

CREATE OR REPLACE FUNCTION public.purchase_sync_sales_order_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.purchase_sync_from_sales_order(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END
  );
  RETURN COALESCE(NEW, OLD);
END
$$;

CREATE OR REPLACE FUNCTION public.purchase_sync_sales_status_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.purchase_sync_from_sales_order(NEW.id);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_purchase_sync_order_items ON public.order_items;
CREATE TRIGGER trg_purchase_sync_order_items
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.purchase_sync_sales_order_trigger();

DROP TRIGGER IF EXISTS trg_purchase_sync_order_status ON public.orders;
CREATE TRIGGER trg_purchase_sync_order_status
AFTER UPDATE OF kind, status, deleted_at, superseded_at, root_order_id, order_date, warehouse_id
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.purchase_sync_sales_status_trigger();

REVOKE ALL ON FUNCTION public.purchase_sync_from_sales_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_sync_sales_order_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_sync_sales_status_trigger() FROM PUBLIC, anon, authenticated;
