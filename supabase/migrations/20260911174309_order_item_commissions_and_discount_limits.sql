-- Regras comerciais por subcategoria/produto e fotografia da comissão usada
-- em cada item do pedido. Alterações futuras no catálogo não mudam pedidos já
-- emitidos.
ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS commission_percent numeric(6,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_discount_percent numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS max_discount_percent numeric(6,2);

ALTER TABLE public.inventory_items
  ALTER COLUMN commission_percent SET DEFAULT 5;

UPDATE public.inventory_items i
SET commission_percent = coalesce(pc.commission_percent, 5)
FROM public.product_categories pc
WHERE i.category_id = pc.id
  AND coalesce(i.commission_percent, 0) = 0;

UPDATE public.inventory_items
SET commission_percent = 5
WHERE category_id IS NULL
  AND coalesce(commission_percent, 0) = 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS commission_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commission_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_address_number text;

CREATE OR REPLACE FUNCTION public.sales_update_order_address_number(p_order_id uuid,p_number text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_seller uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT seller_id INTO current_seller FROM public.orders WHERE id=p_order_id;
  IF NOT FOUND OR NOT public.sales_can_manage(auth.uid(),current_seller) THEN
    RAISE EXCEPTION 'Sem permissão para alterar o endereço do pedido.';
  END IF;
  UPDATE public.orders SET shipping_address_number=nullif(btrim(p_number),'') WHERE id=p_order_id;
  UPDATE public.order_audit_log
  SET new_snapshot=public.sales_order_snapshot(p_order_id)
  WHERE id=(SELECT id FROM public.order_audit_log WHERE order_id=p_order_id ORDER BY created_at DESC LIMIT 1);
END $$;
REVOKE ALL ON FUNCTION public.sales_update_order_address_number(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_update_order_address_number(uuid,text) TO authenticated;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS commission_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commission_percent numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_discount_percent numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE public.product_categories DROP CONSTRAINT IF EXISTS product_categories_commission_percent_check;
ALTER TABLE public.product_categories ADD CONSTRAINT product_categories_commission_percent_check
  CHECK (commission_percent BETWEEN 0 AND 100);
ALTER TABLE public.product_categories DROP CONSTRAINT IF EXISTS product_categories_max_discount_percent_check;
ALTER TABLE public.product_categories ADD CONSTRAINT product_categories_max_discount_percent_check
  CHECK (max_discount_percent BETWEEN 0 AND 100);
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_commission_percent_check;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_commission_percent_check
  CHECK (commission_percent BETWEEN 0 AND 100);
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_max_discount_percent_check;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_max_discount_percent_check
  CHECK (max_discount_percent IS NULL OR max_discount_percent BETWEEN 0 AND 100);
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_commission_percent_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_commission_percent_check
  CHECK (commission_percent BETWEEN 0 AND 100 AND commission_amount >= 0
    AND max_discount_percent BETWEEN 0 AND 100);

CREATE OR REPLACE FUNCTION public.sales_discount_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  value_discount numeric := coalesce(NEW.discount, 0);
  line_value numeric;
  used_percent numeric;
  allowed_percent numeric := 0;
BEGIN
  IF value_discount <= 0 OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.app_has_cap(auth.uid(),'manage_discounts')
     OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('order_items','quote_items') AND NEW.item_id IS NOT NULL THEN
    SELECT coalesce(i.max_discount_percent, pc.max_discount_percent, 0)
      INTO allowed_percent
    FROM public.inventory_items i
    LEFT JOIN public.product_categories pc ON pc.id = i.category_id
    WHERE i.id = NEW.item_id;
    line_value := coalesce(NEW.quantity,0) * coalesce(NEW.unit_price,0);
    used_percent := CASE WHEN line_value > 0 THEN value_discount * 100 / line_value ELSE 100 END;
    IF used_percent <= coalesce(allowed_percent,0) + 0.000001 THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'O desconto deste produto ultrapassa o limite permitido de %%%.',
      round(coalesce(allowed_percent,0),2);
  END IF;

  RAISE EXCEPTION 'Somente cargos de liderança podem definir desconto geral ou ultrapassar o limite do produto.';
END $$;

CREATE OR REPLACE FUNCTION public.sales_apply_order_commissions(p_order_id uuid, p_items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  line record;
  enabled boolean;
  percentage numeric;
  amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Itens inválidos para cálculo da comissão.';
  END IF;

  FOR line IN
    SELECT oi.id,oi.total,payload.value
    FROM public.order_items oi
    JOIN LATERAL (
      SELECT entry.value
      FROM jsonb_array_elements(p_items) entry(value)
      WHERE nullif(entry.value->>'item_id','')::uuid IS NOT DISTINCT FROM oi.item_id
        AND coalesce(entry.value->>'description','') = coalesce(oi.description,'')
      LIMIT 1
    ) payload ON true
    WHERE oi.order_id=p_order_id
  LOOP
    enabled := coalesce((line.value->>'commission_enabled')::boolean, false);
    percentage := CASE WHEN enabled THEN coalesce((line.value->>'commission_percent')::numeric,0) ELSE 0 END;
    IF percentage < 0 OR percentage > 100 THEN
      RAISE EXCEPTION 'Percentual de comissão inválido.';
    END IF;
    amount := CASE WHEN enabled THEN round(greatest(0,line.total) * percentage / 100,2) ELSE 0 END;
    UPDATE public.order_items
    SET commission_enabled=enabled,commission_percent=percentage,commission_amount=amount,
      max_discount_percent=least(100,greatest(0,coalesce((line.value->>'max_discount_percent')::numeric,0)))
    WHERE id=line.id;
  END LOOP;

  UPDATE public.orders o SET
    commission_enabled = EXISTS (
      SELECT 1 FROM public.order_items oi WHERE oi.order_id=o.id AND oi.commission_enabled
    ),
    commission_total = coalesce((
      SELECT sum(oi.commission_amount) FROM public.order_items oi WHERE oi.order_id=o.id
    ),0)
  WHERE o.id=p_order_id;
END $$;
REVOKE ALL ON FUNCTION public.sales_apply_order_commissions(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sales_create_document_v2(
  p_kind text,p_customer_id uuid,p_product_id uuid,
  p_currency public.currency_code,p_discount numeric,p_shipping_cost numeric,p_shipping_percentage numeric,p_notes text,
  p_payment_method text,p_payment_installments text,p_valid_until date,p_whatsapp text,p_origin text,p_items jsonb,p_payments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
  new_id uuid;
  payment_row record;
  receipt_tokens jsonb := '[]'::jsonb;
  root_id uuid;
  revision integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  result := public.sales_create_document_v2_without_cash_receipt(
    p_kind,p_customer_id,p_product_id,p_currency,p_discount,p_shipping_cost,p_shipping_percentage,p_notes,
    p_payment_method,p_payment_installments,p_valid_until,p_whatsapp,p_origin,p_items,p_payments
  );
  new_id := (result ->> 'id')::uuid;
  PERFORM public.sales_apply_order_commissions(new_id,p_items);

  IF p_kind = 'venda' THEN
    FOR payment_row IN
      SELECT p.id,p.receipt_token
      FROM public.payments p
      WHERE p.order_id = new_id
        AND p.status = 'pago'
        AND lower(btrim(coalesce(p.method,''))) = 'dinheiro'
        AND NOT EXISTS (
          SELECT 1 FROM public.order_payment_proofs proof WHERE proof.payment_id = p.id
        )
      ORDER BY p.created_at,p.id
    LOOP
      INSERT INTO public.order_payment_proofs(
        order_id,payment_id,proof_type,file_path,file_name,uploaded_by
      ) VALUES (
        new_id,payment_row.id,'recibo_sistema',payment_row.receipt_token::text,
        'Recibo-pedido-' || lpad(coalesce((result ->> 'number')::integer,0)::text,2,'0') || '.pdf',uid
      );
      receipt_tokens := receipt_tokens || jsonb_build_array(payment_row.receipt_token);
    END LOOP;

    UPDATE public.orders
    SET amount_paid = round(total,2),amount_receivable = 0,payment_status = 'pago',
        workflow_stage = 'vendido',status = 'faturado'
    WHERE id = new_id;
    UPDATE public.accounts_receivable
    SET amount = 0,status = 'pago',paid_at = current_date,updated_at = now()
    WHERE order_id = new_id AND status <> 'cancelado';

    SELECT coalesce(root_order_id,id),revision_no INTO root_id,revision
    FROM public.orders WHERE id = new_id;
    INSERT INTO public.order_audit_log(
      order_id,root_order_id,revision_no,action,changed_by,note,new_snapshot
    ) VALUES (
      new_id,root_id,revision,'pagamento_registrado',uid,
      'Venda quitada no caixa: ' || round((result ->> 'total')::numeric,2) || ' ' || p_currency || '.',
      public.sales_order_snapshot(new_id)
    );
    result := result || jsonb_build_object('receipt_tokens',receipt_tokens,'stage','vendido');
  END IF;

  RETURN result || jsonb_build_object(
    'commission_total',(SELECT commission_total FROM public.orders WHERE id=new_id)
  );
END $$;
REVOKE ALL ON FUNCTION public.sales_create_document_v2(
  text,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,text,date,text,text,jsonb,jsonb
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_create_document_v2(
  text,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,text,date,text,text,jsonb,jsonb
) TO authenticated;

DROP FUNCTION IF EXISTS public.sales_items_for_sale(uuid);
CREATE FUNCTION public.sales_items_for_sale(_product_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,name text,sku text,barcode text,brand text,variation text,
  unit text,price numeric,currency public.currency_code,product_id uuid,category_id uuid,
  available numeric,commission_percent numeric,max_discount_percent numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.id,i.name,i.sku,i.barcode,i.brand,i.variation,i.unit,i.price,i.currency,
    i.product_id,i.category_id,greatest(coalesce(i.quantity,0)-coalesce(i.reserved,0),0),
    coalesce(i.commission_percent,pc.commission_percent,5),
    coalesce(i.max_discount_percent,pc.max_discount_percent,0)
  FROM public.inventory_items i
  LEFT JOIN public.product_categories pc ON pc.id=i.category_id
  WHERE i.is_active AND auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid()
      AND ur.role IN ('superadmin','admin','gestor','financeiro','vendedor','estoque'))
    AND (_product_id IS NULL OR i.product_id=_product_id)
    AND (i.product_id IS NULL OR public.has_product_access(auth.uid(),i.product_id)
      OR public.sales_sees_all(auth.uid()))
  ORDER BY i.name LIMIT 2000
$$;
REVOKE ALL ON FUNCTION public.sales_items_for_sale(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_items_for_sale(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_order_snapshot(p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'id',o.id,'number',o.number,'revision_no',o.revision_no,'customer_id',o.customer_id,'customer_name',c.name,
    'seller_id',o.seller_id,'seller_name',seller.full_name,'currency',o.currency,'discount',o.discount,
    'shipping_cost',o.shipping_cost,'shipping_percentage',o.shipping_percentage,'total',o.total,'status',o.status,
    'commission_enabled',o.commission_enabled,'commission_total',o.commission_total,
    'workflow_stage',o.workflow_stage,'notes',o.notes,'whatsapp',o.whatsapp,'warehouse_id',o.warehouse_id,
    'delivery_recipient_name',o.delivery_recipient_name,'delivery_recipient_document',o.delivery_recipient_document,
    'shipping_address',o.shipping_address,'shipping_address_number',o.shipping_address_number,
    'shipping_cep',o.shipping_cep,'shipping_city',o.shipping_city,
    'shipping_state',o.shipping_state,'delivery_deadline',o.delivery_deadline,'carrier',o.carrier,
    'tracking_code',o.tracking_code,
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('item_id',i.item_id,'description',i.description,'sku',i.sku,
      'quantity',i.quantity,'unit_price',i.unit_price,'discount',i.discount,'total',i.total,
      'commission_enabled',i.commission_enabled,'commission_percent',i.commission_percent,
      'commission_amount',i.commission_amount,'max_discount_percent',i.max_discount_percent) ORDER BY i.created_at)
      FROM public.order_items i WHERE i.order_id=o.id),'[]'::jsonb)
  )
  FROM public.orders o
  LEFT JOIN public.customers c ON c.id=o.customer_id
  LEFT JOIN public.profiles seller ON seller.id=o.seller_id
  WHERE o.id=p_order_id
$$;
REVOKE ALL ON FUNCTION public.sales_order_snapshot(uuid) FROM PUBLIC,anon,authenticated;
