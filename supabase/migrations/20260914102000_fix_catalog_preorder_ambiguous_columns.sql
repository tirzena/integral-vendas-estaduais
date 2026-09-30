CREATE OR REPLACE FUNCTION public.catalog_create_preorder(
  p_slug text,
  p_idempotency_key text,
  p_customer jsonb,
  p_delivery jsonb,
  p_notes text,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_catalog record;
  v_existing record;
  v_line jsonb;
  v_inventory record;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number integer;
  v_quantity numeric;
  v_line_total numeric;
  v_gross numeric := 0;
  v_shipping numeric := 0;
  v_total numeric := 0;
  v_allowed boolean;
  v_phone text := nullif(btrim(coalesce(p_customer->>'phone', '')), '');
  v_email text := nullif(btrim(lower(coalesce(p_customer->>'email', ''))), '');
  v_document text := nullif(btrim(coalesce(p_customer->>'document', '')), '');
  v_customer_name text := nullif(btrim(coalesce(p_customer->>'name', '')), '');
  v_rate_window record;
  v_rate_bucket text;
BEGIN
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Requisição inválida.';
  END IF;

  SELECT dc.*
    INTO v_catalog
    FROM public.digital_catalogs AS dc
   WHERE dc.slug = p_slug;
  IF NOT FOUND OR NOT v_catalog.is_published OR NOT v_catalog.orders_enabled THEN
    RAISE EXCEPTION 'Este catálogo não está recebendo pedidos.';
  END IF;

  SELECT o.id, o.number
    INTO v_existing
    FROM public.orders AS o
   WHERE o.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'number', v_existing.number,
      'duplicated', true
    );
  END IF;

  v_rate_bucket := 'cat:' || v_catalog.id::text;
  INSERT INTO public.catalog_rate_limits AS rate_limit (bucket, window_start, hits)
  VALUES (v_rate_bucket, now(), 1)
  ON CONFLICT ON CONSTRAINT catalog_rate_limits_pkey DO UPDATE
    SET hits = CASE
          WHEN rate_limit.window_start < now() - interval '1 hour' THEN 1
          ELSE rate_limit.hits + 1
        END,
        window_start = CASE
          WHEN rate_limit.window_start < now() - interval '1 hour' THEN now()
          ELSE rate_limit.window_start
        END
  RETURNING rate_limit.* INTO v_rate_window;
  IF v_rate_window.hits > 60 THEN
    RAISE EXCEPTION 'Muitos pedidos em pouco tempo. Tente novamente mais tarde.';
  END IF;

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Informe o nome do cliente.';
  END IF;
  IF v_phone IS NULL AND v_email IS NULL THEN
    RAISE EXCEPTION 'Informe telefone ou e-mail para contato.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Inclua pelo menos um item no pedido.';
  END IF;

  SELECT customer.id
    INTO v_customer_id
    FROM public.customers AS customer
   WHERE customer.deleted_at IS NULL
     AND (
       (v_document IS NOT NULL AND customer.document = v_document)
       OR (
         v_phone IS NOT NULL
         AND regexp_replace(coalesce(customer.phone, ''), '\D', '', 'g') =
             regexp_replace(v_phone, '\D', '', 'g')
       )
       OR (v_email IS NOT NULL AND lower(customer.email) = v_email)
     )
   ORDER BY customer.created_at
   LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (
      name, phone, whatsapp, email, document, city, state, country, address, origin, status
    )
    VALUES (
      v_customer_name,
      v_phone,
      v_phone,
      v_email,
      v_document,
      nullif(p_customer->>'city', ''),
      nullif(p_customer->>'state', ''),
      coalesce(nullif(p_customer->>'country', ''), 'Brasil'),
      nullif(p_customer->>'address', ''),
      'catalogo',
      'ativo'
    )
    RETURNING id INTO v_customer_id;
  END IF;

  v_order_number := public.sales_next_number('orders');

  INSERT INTO public.orders (
    number, customer_id, product_id, seller_id, currency, discount, total,
    status, kind, stock_state, notes, origin, whatsapp, order_date,
    catalog_id, catalog_slug, delivery, shipping_fee, idempotency_key
  )
  VALUES (
    v_order_number,
    v_customer_id,
    NULL,
    v_catalog.default_seller_id,
    v_catalog.currency,
    0,
    0,
    'pre_pedido',
    'pre_pedido',
    'reservado',
    nullif(btrim(coalesce(p_notes, '')), ''),
    'catalogo',
    v_phone,
    CURRENT_DATE,
    v_catalog.id,
    v_catalog.slug,
    coalesce(p_delivery, '{}'::jsonb),
    0,
    p_idempotency_key
  )
  RETURNING id INTO v_order_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := coalesce((v_line->>'quantity')::numeric, 0);
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida em um dos itens.';
    END IF;

    SELECT inventory.*
      INTO v_inventory
      FROM public.inventory_items AS inventory
     WHERE inventory.id = nullif(v_line->>'item_id', '')::uuid
       AND inventory.is_active
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto indisponível no catálogo.';
    END IF;

    v_allowed := CASE
      WHEN array_length(v_catalog.item_ids, 1) IS NOT NULL
        THEN v_inventory.id = ANY(v_catalog.item_ids)
      WHEN array_length(v_catalog.category_ids, 1) IS NOT NULL
        THEN v_inventory.category_id = ANY(v_catalog.category_ids)
      WHEN array_length(v_catalog.product_ids, 1) IS NOT NULL
        THEN v_inventory.product_id = ANY(v_catalog.product_ids)
      ELSE true
    END;
    IF NOT v_allowed THEN
      RAISE EXCEPTION 'Produto fora deste catálogo.';
    END IF;

    IF (v_inventory.quantity - v_inventory.reserved) < v_quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente para %.', v_inventory.name;
    END IF;

    v_line_total := round(v_quantity * coalesce(v_inventory.price, 0), 2);
    v_gross := v_gross + v_line_total;

    INSERT INTO public.order_items (
      order_id, item_id, description, sku, barcode, unit, quantity, unit_price, discount, total
    )
    VALUES (
      v_order_id,
      v_inventory.id,
      v_inventory.name,
      v_inventory.sku,
      v_inventory.barcode,
      v_inventory.unit,
      v_quantity,
      coalesce(v_inventory.price, 0),
      0,
      v_line_total
    );

    UPDATE public.inventory_items AS inventory
       SET reserved = inventory.reserved + v_quantity
     WHERE inventory.id = v_inventory.id;

    INSERT INTO public.inventory_movements (
      item_id, user_id, movement_type, quantity, reason,
      document_type, document_id, document_number
    )
    VALUES (
      v_inventory.id,
      NULL,
      'reserva',
      v_quantity,
      'Reserva de pedido do catálogo',
      'pre_pedido',
      v_order_id,
      v_order_number
    );
  END LOOP;

  IF coalesce(p_delivery->>'mode', 'retirada') = 'entrega' THEN
    v_shipping := CASE v_catalog.shipping_mode
      WHEN 'fixo' THEN coalesce(v_catalog.shipping_fee, 0)
      WHEN 'gratis' THEN 0
      WHEN 'regiao' THEN coalesce((
        SELECT (region->>'fee')::numeric
          FROM jsonb_array_elements(v_catalog.shipping_regions) AS region
         WHERE lower(region->>'name') = lower(coalesce(p_delivery->>'region', ''))
         LIMIT 1
      ), 0)
      ELSE 0
    END;
  END IF;

  v_total := round(v_gross + v_shipping, 2);
  UPDATE public.orders AS target_order
     SET total = v_total,
         shipping_fee = v_shipping
   WHERE target_order.id = v_order_id;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'number', v_order_number,
    'total', v_total,
    'duplicated', false
  );
END;
$function$;
