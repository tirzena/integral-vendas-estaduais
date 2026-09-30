-- Promoções temporárias criadas pela administração, fornecedor ou transporte.
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
  description text,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  origin_type text NOT NULL CHECK (origin_type IN ('admin','supplier','transport')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  destination_scope text NOT NULL DEFAULT 'all'
    CHECK (destination_scope IN ('all','sp','py','other_brazil')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','cancelled')),
  currency public.currency_code NOT NULL,
  original_sale_price numeric(14,2) NOT NULL CHECK (original_sale_price >= 0),
  promotional_sale_price numeric(14,2) NOT NULL CHECK (promotional_sale_price >= 0),
  original_cost numeric(14,2),
  promotional_cost numeric(14,2),
  original_freight_percent numeric(6,2),
  promotional_freight_percent numeric(6,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (promotional_sale_price <= original_sale_price),
  CHECK (promotional_cost IS NULL OR promotional_cost >= 0),
  CHECK (promotional_freight_percent IS NULL OR promotional_freight_percent BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS promotions_active_item_period_idx
  ON public.promotions(item_id, starts_at, ends_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS promotions_creator_idx
  ON public.promotions(created_by, created_at DESC);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;

DROP POLICY IF EXISTS promotions_management_read ON public.promotions;
CREATE POLICY promotions_management_read ON public.promotions FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR created_by = auth.uid());

DROP TRIGGER IF EXISTS trg_promotions_updated ON public.promotions;
CREATE TRIGGER trg_promotions_updated BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION private.current_promotion_mode(_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN public.is_admin(_uid) THEN 'admin'
    WHEN public.has_role(_uid, 'fornecedor') THEN 'supplier'
    WHEN public.has_role(_uid, 'entregador') THEN 'transport'
    ELSE 'none'
  END
$$;
REVOKE ALL ON FUNCTION private.current_promotion_mode(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_promotion_mode(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.promotion_management_items()
RETURNS TABLE(
  id uuid, name text, supplier_id uuid, supplier_name text, currency public.currency_code,
  sale_price numeric, cost numeric, freight_sp_percent numeric,
  freight_py_percent numeric, freight_other_brazil_percent numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.id, i.name, i.supplier_id, s.name, i.currency, i.price,
    CASE WHEN private.current_promotion_mode(auth.uid()) IN ('admin','supplier') THEN i.cost ELSE NULL END,
    CASE WHEN private.current_promotion_mode(auth.uid()) IN ('admin','transport') THEN i.freight_sp_percent ELSE NULL END,
    CASE WHEN private.current_promotion_mode(auth.uid()) IN ('admin','transport') THEN i.freight_py_percent ELSE NULL END,
    CASE WHEN private.current_promotion_mode(auth.uid()) IN ('admin','transport') THEN i.freight_other_brazil_percent ELSE NULL END
  FROM public.inventory_items i
  LEFT JOIN public.suppliers s ON s.id = i.supplier_id
  WHERE auth.uid() IS NOT NULL
    AND i.is_active
    AND (
      private.current_promotion_mode(auth.uid()) IN ('admin','transport')
      OR (
        private.current_promotion_mode(auth.uid()) = 'supplier'
        AND EXISTS (
          SELECT 1 FROM public.supplier_user_assignments sua
          WHERE sua.user_id = auth.uid() AND sua.supplier_id = i.supplier_id
        )
      )
    )
  ORDER BY i.name
$$;
REVOKE ALL ON FUNCTION public.promotion_management_items() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_management_items() TO authenticated;

CREATE OR REPLACE FUNCTION public.promotions_for_management()
RETURNS TABLE(
  id uuid, title text, description text, item_id uuid, item_name text,
  origin_type text, creator_name text, destination_scope text,
  starts_at timestamptz, ends_at timestamptz, status text, currency public.currency_code,
  original_sale_price numeric, promotional_sale_price numeric,
  original_cost numeric, promotional_cost numeric,
  original_freight_percent numeric, promotional_freight_percent numeric,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, p.title, p.description, p.item_id, i.name, p.origin_type,
    coalesce(pr.full_name, pr.email, 'Usuário'), p.destination_scope,
    p.starts_at, p.ends_at, p.status, p.currency,
    p.original_sale_price, p.promotional_sale_price,
    CASE WHEN private.current_promotion_mode(auth.uid()) IN ('admin','supplier') THEN p.original_cost ELSE NULL END,
    CASE WHEN private.current_promotion_mode(auth.uid()) IN ('admin','supplier') THEN p.promotional_cost ELSE NULL END,
    CASE WHEN private.current_promotion_mode(auth.uid()) IN ('admin','transport') THEN p.original_freight_percent ELSE NULL END,
    CASE WHEN private.current_promotion_mode(auth.uid()) IN ('admin','transport') THEN p.promotional_freight_percent ELSE NULL END,
    p.created_at
  FROM public.promotions p
  JOIN public.inventory_items i ON i.id = p.item_id
  LEFT JOIN public.profiles pr ON pr.id = p.created_by
  WHERE auth.uid() IS NOT NULL
    AND (public.is_admin(auth.uid()) OR p.created_by = auth.uid())
  ORDER BY p.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.promotions_for_management() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotions_for_management() TO authenticated;

CREATE OR REPLACE FUNCTION public.active_promotions_for_me()
RETURNS TABLE(
  id uuid, title text, description text, item_id uuid, item_name text,
  origin_label text, starts_at timestamptz, ends_at timestamptz,
  currency public.currency_code, original_sale_price numeric, promotional_sale_price numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, p.title, p.description, p.item_id, i.name,
    CASE p.origin_type WHEN 'supplier' THEN 'Fornecedor' WHEN 'transport' THEN 'Transporte' ELSE 'Administração' END,
    p.starts_at, p.ends_at, p.currency, p.original_sale_price, p.promotional_sale_price
  FROM public.promotions p
  JOIN public.inventory_items i ON i.id = p.item_id
  WHERE auth.uid() IS NOT NULL
    AND p.status = 'active'
    AND now() BETWEEN p.starts_at AND p.ends_at
  ORDER BY (p.original_sale_price - p.promotional_sale_price) DESC, p.ends_at ASC
$$;
REVOKE ALL ON FUNCTION public.active_promotions_for_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.active_promotions_for_me() TO authenticated;

CREATE OR REPLACE FUNCTION public.promotion_save(
  p_id uuid,
  p_title text,
  p_description text,
  p_item_id uuid,
  p_destination_scope text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_promotional_sale_price numeric DEFAULT NULL,
  p_promotional_cost numeric DEFAULT NULL,
  p_promotional_freight_percent numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  mode text;
  item public.inventory_items%ROWTYPE;
  assigned_supplier uuid;
  original_freight numeric;
  final_sale numeric;
  final_cost numeric;
  final_freight numeric;
  result_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sessão expirada.'; END IF;
  mode := private.current_promotion_mode(uid);
  IF mode = 'none' THEN RAISE EXCEPTION 'Sem permissão para gerenciar promoções.'; END IF;
  IF p_ends_at <= p_starts_at THEN RAISE EXCEPTION 'O fim da promoção deve ser posterior ao início.'; END IF;
  IF p_destination_scope NOT IN ('all','sp','py','other_brazil') THEN
    RAISE EXCEPTION 'Destino da promoção inválido.';
  END IF;

  SELECT * INTO item FROM public.inventory_items WHERE id = p_item_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado ou inativo.'; END IF;

  IF mode = 'supplier' THEN
    SELECT supplier_id INTO assigned_supplier
    FROM public.supplier_user_assignments WHERE user_id = uid;
    IF assigned_supplier IS NULL OR item.supplier_id IS DISTINCT FROM assigned_supplier THEN
      RAISE EXCEPTION 'Este produto não pertence ao fornecedor vinculado ao seu acesso.';
    END IF;
  END IF;

  original_freight := CASE p_destination_scope
    WHEN 'sp' THEN item.freight_sp_percent
    WHEN 'py' THEN item.freight_py_percent
    ELSE item.freight_other_brazil_percent
  END;

  IF mode = 'admin' THEN
    final_cost := coalesce(p_promotional_cost, item.cost);
    final_freight := coalesce(p_promotional_freight_percent, original_freight);
    final_sale := coalesce(
      p_promotional_sale_price,
      greatest(0, item.price - greatest(item.cost - final_cost, 0)
        - item.cost * greatest(original_freight - final_freight, 0) / 100)
    );
  ELSIF mode = 'supplier' THEN
    IF p_promotional_cost IS NULL THEN RAISE EXCEPTION 'Informe o custo promocional.'; END IF;
    final_cost := p_promotional_cost;
    final_freight := NULL;
    final_sale := greatest(0, item.price - greatest(item.cost - final_cost, 0));
    p_destination_scope := 'all';
  ELSE
    IF p_promotional_freight_percent IS NULL THEN RAISE EXCEPTION 'Informe o frete promocional.'; END IF;
    final_cost := NULL;
    final_freight := p_promotional_freight_percent;
    final_sale := greatest(0, item.price
      - item.cost * greatest(original_freight - final_freight, 0) / 100);
  END IF;

  IF final_cost IS NOT NULL AND (final_cost < 0 OR final_cost > item.cost) THEN
    RAISE EXCEPTION 'O custo promocional deve ficar entre zero e o custo atual.';
  END IF;
  IF final_freight IS NOT NULL AND (final_freight < 0 OR final_freight > original_freight) THEN
    RAISE EXCEPTION 'O frete promocional deve ficar entre zero e o percentual atual.';
  END IF;
  IF final_sale < 0 OR final_sale > item.price THEN
    RAISE EXCEPTION 'O valor promocional deve ficar entre zero e o valor atual de venda.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions(
      title,description,item_id,origin_type,created_by,supplier_id,destination_scope,
      starts_at,ends_at,status,currency,original_sale_price,promotional_sale_price,
      original_cost,promotional_cost,original_freight_percent,promotional_freight_percent
    ) VALUES (
      btrim(p_title),nullif(btrim(p_description),''),item.id,mode,uid,item.supplier_id,p_destination_scope,
      p_starts_at,p_ends_at,'active',item.currency,item.price,round(final_sale,2),
      item.cost,final_cost,original_freight,final_freight
    ) RETURNING id INTO result_id;
  ELSE
    UPDATE public.promotions p SET
      title=btrim(p_title), description=nullif(btrim(p_description),''), item_id=item.id,
      supplier_id=item.supplier_id, destination_scope=p_destination_scope,
      starts_at=p_starts_at, ends_at=p_ends_at, currency=item.currency,
      original_sale_price=item.price, promotional_sale_price=round(final_sale,2),
      original_cost=item.cost,
      promotional_cost=final_cost,
      original_freight_percent=original_freight,
      promotional_freight_percent=final_freight,
      status='active'
    WHERE p.id=p_id AND (public.is_admin(uid) OR p.created_by=uid)
    RETURNING p.id INTO result_id;
    IF result_id IS NULL THEN RAISE EXCEPTION 'Promoção não encontrada ou sem permissão.'; END IF;
  END IF;
  RETURN result_id;
END
$$;
REVOKE ALL ON FUNCTION public.promotion_save(uuid,text,text,uuid,text,timestamptz,timestamptz,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_save(uuid,text,text,uuid,text,timestamptz,timestamptz,numeric,numeric,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.promotion_cancel(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.promotions p SET status='cancelled'
  WHERE p.id=p_id AND (public.is_admin(auth.uid()) OR p.created_by=auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Promoção não encontrada ou sem permissão.'; END IF;
END
$$;
REVOKE ALL ON FUNCTION public.promotion_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_cancel(uuid) TO authenticated;

-- O pedido recebe a melhor promoção vigente sem expor custo ou frete internos.
DROP FUNCTION IF EXISTS public.sales_items_for_sale(uuid);
CREATE FUNCTION public.sales_items_for_sale(_product_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,name text,sku text,barcode text,brand text,variation text,
  unit text,price numeric,currency public.currency_code,product_id uuid,category_id uuid,
  available numeric,commission_percent numeric,max_discount_percent numeric,
  promotional_price numeric,promotion_id uuid,promotion_title text,
  promotion_starts_at timestamptz,promotion_ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.id,i.name,i.sku,i.barcode,i.brand,i.variation,i.unit,i.price,i.currency,
    i.product_id,i.category_id,greatest(coalesce(i.quantity,0)-coalesce(i.reserved,0),0),
    coalesce(i.commission_percent,5),coalesce(i.max_discount_percent,0),
    promo.promotional_sale_price,promo.id,promo.title,promo.starts_at,promo.ends_at
  FROM public.inventory_items i
  LEFT JOIN LATERAL (
    SELECT p.id,p.title,p.promotional_sale_price,p.starts_at,p.ends_at
    FROM public.promotions p
    WHERE p.item_id=i.id AND p.status='active' AND now() BETWEEN p.starts_at AND p.ends_at
    ORDER BY p.promotional_sale_price ASC,p.ends_at ASC LIMIT 1
  ) promo ON true
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
