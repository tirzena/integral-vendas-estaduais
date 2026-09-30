
-- =========================================================
-- Importação de listas de fornecedor (aditivo)
-- =========================================================

CREATE OR REPLACE FUNCTION public.imports_can_manage(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.is_admin(_uid)
    OR (public.has_role(_uid, 'estoque') AND public.app_has_cap(_uid, 'inventory_manage'))
  )
$$;

-- ---------- aliases / mapeamentos ----------
CREATE TABLE IF NOT EXISTS public.supplier_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  supplier_code text,
  alias_normalized text,
  received_description text,
  confidence numeric NOT NULL DEFAULT 1,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_mapping_key_present CHECK (supplier_code IS NOT NULL OR alias_normalized IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_mapping_code_uk
  ON public.supplier_product_mappings (supplier_id, lower(supplier_code)) WHERE supplier_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS supplier_mapping_alias_uk
  ON public.supplier_product_mappings (supplier_id, alias_normalized) WHERE alias_normalized IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_product_mappings TO authenticated;
GRANT ALL ON public.supplier_product_mappings TO service_role;
ALTER TABLE public.supplier_product_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY spm_read ON public.supplier_product_mappings FOR SELECT TO authenticated
  USING (public.imports_can_manage(auth.uid()));
CREATE POLICY spm_write ON public.supplier_product_mappings FOR ALL TO authenticated
  USING (public.imports_can_manage(auth.uid())) WITH CHECK (public.imports_can_manage(auth.uid()));

-- ---------- modelos de leitura ----------
CREATE TABLE IF NOT EXISTS public.supplier_import_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Padrão',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_template_uk
  ON public.supplier_import_templates (supplier_id, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_import_templates TO authenticated;
GRANT ALL ON public.supplier_import_templates TO service_role;
ALTER TABLE public.supplier_import_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY sit_read ON public.supplier_import_templates FOR SELECT TO authenticated
  USING (public.imports_can_manage(auth.uid()));
CREATE POLICY sit_write ON public.supplier_import_templates FOR ALL TO authenticated
  USING (public.imports_can_manage(auth.uid())) WITH CHECK (public.imports_can_manage(auth.uid()));

-- ---------- lotes ----------
CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'texto',
  content_hash text NOT NULL,
  list_currency currency_code NOT NULL,
  base_currency currency_code NOT NULL,
  rates jsonb NOT NULL DEFAULT '{}'::jsonb,
  qty_mode text NOT NULL CHECK (qty_mode IN ('absoluto','entrada','disponibilidade','nenhum')),
  value_target text NOT NULL CHECK (value_target IN ('custo','preco','nenhum')),
  apply_markup boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aplicado','falhou','revertido')),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at timestamptz,
  reverted_at timestamptz,
  reverted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS import_batches_hash_uk
  ON public.import_batches (supplier_id, content_hash) WHERE status = 'aplicado';
GRANT SELECT, INSERT, UPDATE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY ib_read ON public.import_batches FOR SELECT TO authenticated
  USING (public.imports_can_manage(auth.uid()));

CREATE TABLE IF NOT EXISTS public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  raw_text text,
  supplier_code text,
  description text,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'aplicada',
  qty numeric,
  unit text,
  value numeric,
  value_converted numeric,
  old_qty numeric,
  new_qty numeric,
  old_value numeric,
  new_value numeric,
  old_price numeric,
  new_price numeric,
  warning text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_rows_batch_idx ON public.import_rows (batch_id);
GRANT SELECT ON public.import_rows TO authenticated;
GRANT ALL ON public.import_rows TO service_role;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY ir_read ON public.import_rows FOR SELECT TO authenticated
  USING (public.imports_can_manage(auth.uid()));

-- ---------- disponibilidade do fornecedor ----------
CREATE TABLE IF NOT EXISTS public.supplier_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  value numeric,
  currency currency_code,
  batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_availability_uk
  ON public.supplier_availability (supplier_id, inventory_item_id);
GRANT SELECT ON public.supplier_availability TO authenticated;
GRANT ALL ON public.supplier_availability TO service_role;
ALTER TABLE public.supplier_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY sa_read ON public.supplier_availability FOR SELECT TO authenticated
  USING (public.imports_can_manage(auth.uid()));

-- ---------- histórico de preços ----------
CREATE TABLE IF NOT EXISTS public.inventory_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('custo','preco')),
  old_value numeric,
  new_value numeric,
  currency currency_code,
  list_currency currency_code,
  rate_used numeric,
  source text NOT NULL DEFAULT 'lista_fornecedor',
  batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iph_item_idx ON public.inventory_price_history (item_id, created_at DESC);
GRANT SELECT ON public.inventory_price_history TO authenticated;
GRANT ALL ON public.inventory_price_history TO service_role;
ALTER TABLE public.inventory_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY iph_read ON public.inventory_price_history FOR SELECT TO authenticated
  USING (public.imports_can_manage(auth.uid()));

-- ---------- aplicação transacional ----------
CREATE OR REPLACE FUNCTION public.imports_apply_list(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_supplier uuid := (p->>'supplier_id')::uuid;
  v_hash text := coalesce(p->>'content_hash','');
  v_qty_mode text := coalesce(p->>'qty_mode','nenhum');
  v_target text := coalesce(p->>'value_target','nenhum');
  v_list_cur currency_code := coalesce((p->>'list_currency')::currency_code, 'USD');
  v_base_cur currency_code := coalesce((p->>'base_currency')::currency_code, 'BRL');
  v_rates jsonb := coalesce(p->'rates','{}'::jsonb);
  v_markup boolean := coalesce((p->>'apply_markup')::boolean,false);
  v_batch uuid;
  r jsonb;
  v_item public.inventory_items%ROWTYPE;
  v_qty numeric; v_val numeric; v_conv numeric;
  v_newqty numeric; v_delta numeric;
  v_newcost numeric; v_newprice numeric;
  v_rate_list numeric; v_rate_item numeric;
  v_qty_changes int := 0; v_val_changes int := 0; v_rows int := 0;
BEGIN
  IF NOT public.imports_can_manage(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para aplicar listas de fornecedor';
  END IF;
  IF v_supplier IS NULL OR NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_supplier) THEN
    RAISE EXCEPTION 'Fornecedor inválido';
  END IF;
  IF v_hash = '' THEN RAISE EXCEPTION 'Identificação da lista ausente'; END IF;
  IF EXISTS (SELECT 1 FROM public.import_batches
             WHERE supplier_id = v_supplier AND content_hash = v_hash AND status = 'aplicado') THEN
    RAISE EXCEPTION 'Esta lista já foi aplicada para este fornecedor';
  END IF;
  IF v_qty_mode NOT IN ('absoluto','entrada','disponibilidade','nenhum') THEN
    RAISE EXCEPTION 'Modo de quantidade inválido';
  END IF;
  IF v_target NOT IN ('custo','preco','nenhum') THEN
    RAISE EXCEPTION 'Finalidade do valor inválida';
  END IF;

  INSERT INTO public.import_batches
    (supplier_id, source, content_hash, list_currency, base_currency, rates,
     qty_mode, value_target, apply_markup, status, created_by, notes)
  VALUES (v_supplier, coalesce(p->>'source','texto'), v_hash, v_list_cur, v_base_cur, v_rates,
          v_qty_mode, v_target, v_markup, 'rascunho', v_uid, nullif(p->>'notes',''))
  RETURNING id INTO v_batch;

  v_rate_list := coalesce(nullif(v_rates->>v_list_cur::text,'')::numeric, 1);
  IF v_rate_list <= 0 THEN RAISE EXCEPTION 'Cotação inválida para a moeda da lista'; END IF;

  FOR r IN
    SELECT value FROM jsonb_array_elements(coalesce(p->'rows','[]'::jsonb)) AS t(value)
    ORDER BY (value->>'item_id')
  LOOP
    v_rows := v_rows + 1;
    SELECT * INTO v_item FROM public.inventory_items
      WHERE id = (r->>'item_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado na linha %', r->>'line_no'; END IF;
    IF NOT public.inv_can_write_product(v_uid, v_item.product_id) THEN
      RAISE EXCEPTION 'Sem escopo para o produto da linha %', r->>'line_no';
    END IF;

    v_qty := nullif(r->>'qty','')::numeric;
    v_val := nullif(r->>'value','')::numeric;
    IF v_qty IS NOT NULL AND v_qty < 0 THEN
      RAISE EXCEPTION 'Quantidade negativa na linha %', r->>'line_no';
    END IF;
    IF v_val IS NOT NULL AND v_val < 0 THEN
      RAISE EXCEPTION 'Valor negativo na linha %', r->>'line_no';
    END IF;

    v_rate_item := coalesce(nullif(v_rates->>coalesce(v_item.currency,'USD')::text,'')::numeric, v_rate_list);
    IF v_rate_item <= 0 THEN RAISE EXCEPTION 'Cotação inválida do produto na linha %', r->>'line_no'; END IF;
    v_conv := CASE WHEN v_val IS NULL THEN NULL ELSE round(v_val * v_rate_list / v_rate_item, 6) END;

    v_newqty := NULL; v_delta := NULL; v_newcost := NULL; v_newprice := NULL;

    IF v_qty IS NOT NULL AND v_qty_mode IN ('absoluto','entrada') THEN
      v_newqty := CASE WHEN v_qty_mode = 'absoluto' THEN v_qty ELSE coalesce(v_item.quantity,0) + v_qty END;
      v_delta := v_newqty - coalesce(v_item.quantity,0);
    END IF;

    IF v_conv IS NOT NULL AND v_target = 'custo' THEN
      v_newcost := v_conv;
      IF v_markup AND coalesce(v_item.markup_percent,0) > 0 THEN
        v_newprice := round(v_conv * (1 + v_item.markup_percent/100.0), 6);
      END IF;
    ELSIF v_conv IS NOT NULL AND v_target = 'preco' THEN
      v_newprice := v_conv;
    END IF;

    IF v_qty_mode = 'disponibilidade' THEN
      INSERT INTO public.supplier_availability (supplier_id, inventory_item_id, quantity, value, currency, batch_id, updated_at)
      VALUES (v_supplier, v_item.id, coalesce(v_qty,0), v_val, v_list_cur, v_batch, now())
      ON CONFLICT (supplier_id, inventory_item_id) DO UPDATE
        SET quantity = EXCLUDED.quantity, value = EXCLUDED.value, currency = EXCLUDED.currency,
            batch_id = EXCLUDED.batch_id, updated_at = now();
      v_newqty := NULL; v_delta := NULL;
    END IF;

    IF v_newqty IS NOT NULL OR v_newcost IS NOT NULL OR v_newprice IS NOT NULL THEN
      UPDATE public.inventory_items SET
        quantity = coalesce(v_newqty, quantity),
        cost = coalesce(v_newcost, cost),
        price = coalesce(v_newprice, price),
        updated_at = now()
      WHERE id = v_item.id;
    END IF;

    IF v_delta IS NOT NULL AND v_delta <> 0 THEN
      v_qty_changes := v_qty_changes + 1;
      INSERT INTO public.inventory_movements (item_id, user_id, movement_type, quantity, reason, document_type, document_id)
      VALUES (v_item.id, v_uid, CASE WHEN v_delta > 0 THEN 'entrada' ELSE 'saida' END,
              abs(v_delta), 'Atualização por lista do fornecedor', 'import_batch', v_batch);
    END IF;

    IF v_newcost IS NOT NULL AND coalesce(v_item.cost,-1) <> v_newcost THEN
      v_val_changes := v_val_changes + 1;
      INSERT INTO public.inventory_price_history (item_id, field, old_value, new_value, currency, list_currency, rate_used, batch_id, changed_by)
      VALUES (v_item.id, 'custo', v_item.cost, v_newcost, v_item.currency, v_list_cur, v_rate_list / v_rate_item, v_batch, v_uid);
    END IF;
    IF v_newprice IS NOT NULL AND coalesce(v_item.price,-1) <> v_newprice THEN
      v_val_changes := v_val_changes + 1;
      INSERT INTO public.inventory_price_history (item_id, field, old_value, new_value, currency, list_currency, rate_used, batch_id, changed_by)
      VALUES (v_item.id, 'preco', v_item.price, v_newprice, v_item.currency, v_list_cur, v_rate_list / v_rate_item, v_batch, v_uid);
    END IF;

    INSERT INTO public.import_rows
      (batch_id, line_no, raw_text, supplier_code, description, inventory_item_id, state,
       qty, unit, value, value_converted, old_qty, new_qty, old_value, new_value, old_price, new_price, warning)
    VALUES (v_batch, coalesce((r->>'line_no')::int, v_rows), nullif(r->>'raw_text',''), nullif(r->>'supplier_code',''),
            nullif(r->>'description',''), v_item.id, 'aplicada', v_qty, nullif(r->>'unit',''), v_val, v_conv,
            v_item.quantity, v_newqty, v_item.cost, v_newcost, v_item.price, v_newprice, nullif(r->>'warning',''));
  END LOOP;

  UPDATE public.import_batches
     SET status = 'aplicado', applied_at = now(), updated_at = now(),
         counts = jsonb_build_object('linhas', v_rows, 'quantidades', v_qty_changes, 'valores', v_val_changes)
   WHERE id = v_batch;

  RETURN jsonb_build_object('batch_id', v_batch, 'rows', v_rows,
                            'qty_changes', v_qty_changes, 'value_changes', v_val_changes);
END;
$$;

REVOKE ALL ON FUNCTION public.imports_apply_list(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imports_apply_list(jsonb) TO authenticated;

-- ---------- desfazer lote ----------
CREATE OR REPLACE FUNCTION public.imports_undo_batch(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_batch public.import_batches%ROWTYPE;
  r public.import_rows%ROWTYPE;
  v_restored int := 0;
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'Somente administradores podem desfazer lotes'; END IF;
  SELECT * INTO v_batch FROM public.import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
  IF v_batch.status <> 'aplicado' THEN RAISE EXCEPTION 'Somente lotes aplicados podem ser desfeitos'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_movements m
    JOIN public.import_rows ir ON ir.inventory_item_id = m.item_id AND ir.batch_id = p_batch_id
    WHERE m.created_at > v_batch.applied_at
      AND coalesce(m.document_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_batch_id
  ) THEN
    RAISE EXCEPTION 'Existem movimentações posteriores para estes produtos; desfazer está bloqueado';
  END IF;

  FOR r IN SELECT * FROM public.import_rows WHERE batch_id = p_batch_id ORDER BY inventory_item_id LOOP
    IF r.inventory_item_id IS NULL THEN CONTINUE; END IF;
    PERFORM 1 FROM public.inventory_items WHERE id = r.inventory_item_id FOR UPDATE;
    UPDATE public.inventory_items SET
      quantity = CASE WHEN r.new_qty IS NOT NULL THEN r.old_qty ELSE quantity END,
      cost = CASE WHEN r.new_value IS NOT NULL THEN r.old_value ELSE cost END,
      price = CASE WHEN r.new_price IS NOT NULL THEN r.old_price ELSE price END,
      updated_at = now()
    WHERE id = r.inventory_item_id;
    IF r.new_qty IS NOT NULL AND r.new_qty <> coalesce(r.old_qty,0) THEN
      INSERT INTO public.inventory_movements (item_id, user_id, movement_type, quantity, reason, document_type, document_id)
      VALUES (r.inventory_item_id, v_uid,
              CASE WHEN r.new_qty > coalesce(r.old_qty,0) THEN 'saida' ELSE 'entrada' END,
              abs(r.new_qty - coalesce(r.old_qty,0)),
              'Estorno de lista do fornecedor', 'import_batch_undo', p_batch_id);
    END IF;
    v_restored := v_restored + 1;
  END LOOP;

  UPDATE public.import_batches
     SET status = 'revertido', reverted_at = now(), reverted_by = v_uid, updated_at = now()
   WHERE id = p_batch_id;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'restored', v_restored);
END;
$$;

REVOKE ALL ON FUNCTION public.imports_undo_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imports_undo_batch(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.imports_can_manage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imports_can_manage(uuid) TO authenticated;

CREATE TRIGGER trg_spm_updated BEFORE UPDATE ON public.supplier_product_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sit_updated BEFORE UPDATE ON public.supplier_import_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ib_updated BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
