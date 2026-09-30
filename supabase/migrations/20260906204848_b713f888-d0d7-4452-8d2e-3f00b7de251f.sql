-- 1) Configuração do catálogo (aditivo)
ALTER TABLE public.digital_catalogs
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS primary_color text,
  ADD COLUMN IF NOT EXISTS accent_color text,
  ADD COLUMN IF NOT EXISTS about text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_address text,
  ADD COLUMN IF NOT EXISTS brands text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS offer_item_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sort_mode text NOT NULL DEFAULT 'nome',
  ADD COLUMN IF NOT EXISTS consult_label text NOT NULL DEFAULT 'Consultar',
  ADD COLUMN IF NOT EXISTS require_identification boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_availability boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS orders_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS success_message text,
  ADD COLUMN IF NOT EXISTS installments_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS installments_max integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS payment_methods text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pickup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pickup_address text,
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipping_mode text NOT NULL DEFAULT 'combinar',
  ADD COLUMN IF NOT EXISTS shipping_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_days integer,
  ADD COLUMN IF NOT EXISTS shipping_regions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Pedidos vindos do catálogo (aditivo)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS catalog_id uuid REFERENCES public.digital_catalogs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_slug text,
  ADD COLUMN IF NOT EXISTS delivery jsonb,
  ADD COLUMN IF NOT EXISTS shipping_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_uidx
  ON public.orders (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 3) Limite de tentativas do canal público
CREATE TABLE IF NOT EXISTS public.catalog_rate_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.catalog_rate_limits TO service_role;
ALTER TABLE public.catalog_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins veem limites do catalogo" ON public.catalog_rate_limits
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 4) Rotina validada de criação de pré-pedido pelo catálogo público
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
AS $$
DECLARE
  cat record;
  existing record;
  li jsonb;
  inv record;
  cust_id uuid;
  new_id uuid;
  n integer;
  qty numeric;
  line_total numeric;
  gross numeric := 0;
  ship numeric := 0;
  total numeric := 0;
  allowed boolean;
  phone text := nullif(btrim(coalesce(p_customer->>'phone','')), '');
  email text := nullif(btrim(lower(coalesce(p_customer->>'email',''))), '');
  doc   text := nullif(btrim(coalesce(p_customer->>'document','')), '');
  cname text := nullif(btrim(coalesce(p_customer->>'name','')), '');
  win record;
  bucket text;
BEGIN
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Requisição inválida.';
  END IF;

  SELECT * INTO cat FROM public.digital_catalogs WHERE slug = p_slug;
  IF NOT FOUND OR NOT cat.is_published OR NOT cat.orders_enabled THEN
    RAISE EXCEPTION 'Este catálogo não está recebendo pedidos.';
  END IF;

  -- idempotência: devolve o pedido já criado
  SELECT id, number INTO existing FROM public.orders WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('id', existing.id, 'number', existing.number, 'duplicated', true);
  END IF;

  -- limite de tentativas por catálogo (60/hora)
  bucket := 'cat:' || cat.id::text;
  INSERT INTO public.catalog_rate_limits(bucket, window_start, hits)
  VALUES (bucket, now(), 1)
  ON CONFLICT (bucket) DO UPDATE
    SET hits = CASE WHEN public.catalog_rate_limits.window_start < now() - interval '1 hour' THEN 1
                    ELSE public.catalog_rate_limits.hits + 1 END,
        window_start = CASE WHEN public.catalog_rate_limits.window_start < now() - interval '1 hour' THEN now()
                    ELSE public.catalog_rate_limits.window_start END
  RETURNING * INTO win;
  IF win.hits > 60 THEN
    RAISE EXCEPTION 'Muitos pedidos em pouco tempo. Tente novamente mais tarde.';
  END IF;

  IF cname IS NULL THEN RAISE EXCEPTION 'Informe o nome do cliente.'; END IF;
  IF phone IS NULL AND email IS NULL THEN
    RAISE EXCEPTION 'Informe telefone ou e-mail para contato.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Inclua pelo menos um item no pedido.';
  END IF;

  -- cliente sem duplicidade
  SELECT id INTO cust_id FROM public.customers
   WHERE deleted_at IS NULL
     AND ( (doc IS NOT NULL AND document = doc)
        OR (phone IS NOT NULL AND regexp_replace(coalesce(phone,''),'\D','','g') = regexp_replace(public.customers.phone,'\D','','g'))
        OR (email IS NOT NULL AND lower(public.customers.email) = email) )
   ORDER BY created_at LIMIT 1;

  IF cust_id IS NULL THEN
    INSERT INTO public.customers(name, phone, whatsapp, email, document, city, state, country, address, origin, status)
    VALUES (cname, phone, phone, email, doc,
            nullif(p_customer->>'city',''), nullif(p_customer->>'state',''),
            coalesce(nullif(p_customer->>'country',''),'Brasil'),
            nullif(p_customer->>'address',''), 'catalogo', 'ativo')
    RETURNING id INTO cust_id;
  END IF;

  n := public.sales_next_number('orders');

  INSERT INTO public.orders(number, customer_id, product_id, seller_id, currency, discount, total,
    status, kind, stock_state, notes, origin, whatsapp, order_date,
    catalog_id, catalog_slug, delivery, shipping_fee, idempotency_key)
  VALUES (n, cust_id, NULL, NULL, cat.currency, 0, 0,
    'pre_pedido', 'pre_pedido', 'reservado', nullif(btrim(coalesce(p_notes,'')),''), 'catalogo',
    phone, CURRENT_DATE, cat.id, cat.slug, coalesce(p_delivery,'{}'::jsonb), 0, p_idempotency_key)
  RETURNING id INTO new_id;

  FOR li IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    qty := coalesce((li->>'quantity')::numeric, 0);
    IF qty <= 0 THEN RAISE EXCEPTION 'Quantidade inválida em um dos itens.'; END IF;

    SELECT * INTO inv FROM public.inventory_items
      WHERE id = nullif(li->>'item_id','')::uuid AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto indisponível no catálogo.'; END IF;

    -- o item precisa pertencer ao escopo do catálogo
    allowed := CASE
      WHEN array_length(cat.item_ids,1) IS NOT NULL THEN inv.id = ANY(cat.item_ids)
      WHEN array_length(cat.category_ids,1) IS NOT NULL THEN inv.category_id = ANY(cat.category_ids)
      WHEN array_length(cat.product_ids,1) IS NOT NULL THEN inv.product_id = ANY(cat.product_ids)
      ELSE true END;
    IF NOT allowed THEN RAISE EXCEPTION 'Produto fora deste catálogo.'; END IF;

    IF (inv.quantity - inv.reserved) < qty THEN
      RAISE EXCEPTION 'Estoque insuficiente para %.', inv.name;
    END IF;

    line_total := round(qty * coalesce(inv.price,0), 2);
    gross := gross + line_total;

    INSERT INTO public.order_items(order_id, item_id, description, sku, barcode, unit, quantity, unit_price, discount, total)
    VALUES (new_id, inv.id, inv.name, inv.sku, inv.barcode, inv.unit, qty, coalesce(inv.price,0), 0, line_total);

    UPDATE public.inventory_items SET reserved = reserved + qty WHERE id = inv.id;
    INSERT INTO public.inventory_movements(item_id, user_id, movement_type, quantity, reason, document_type, document_id, document_number)
    VALUES (inv.id, NULL, 'reserva', qty, 'Reserva de pedido do catálogo', 'pre_pedido', new_id, n);
  END LOOP;

  -- frete conforme configuração do catálogo
  IF coalesce(p_delivery->>'mode','retirada') = 'entrega' THEN
    ship := CASE cat.shipping_mode
      WHEN 'fixo' THEN coalesce(cat.shipping_fee,0)
      WHEN 'gratis' THEN 0
      WHEN 'regiao' THEN coalesce((
        SELECT (r->>'fee')::numeric FROM jsonb_array_elements(cat.shipping_regions) r
        WHERE lower(r->>'name') = lower(coalesce(p_delivery->>'region','')) LIMIT 1), 0)
      ELSE 0 END;
  END IF;

  total := round(gross + ship, 2);
  UPDATE public.orders SET total = total, shipping_fee = ship WHERE id = new_id;

  RETURN jsonb_build_object('id', new_id, 'number', n, 'total', total, 'duplicated', false);
END $$;

REVOKE ALL ON FUNCTION public.catalog_create_preorder(text,text,jsonb,jsonb,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.catalog_create_preorder(text,text,jsonb,jsonb,text,jsonb) TO anon, authenticated, service_role;