-- Supplier-owned stock, independent from historical sales purchases.
CREATE TABLE public.supplier_stock_lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
 item_id uuid NOT NULL REFERENCES public.inventory_items(id), lot_number text NOT NULL CHECK(length(lot_number) BETWEEN 1 AND 80),
 purchase_date date NOT NULL, manufacture_date date NOT NULL, expiry_date date NOT NULL CHECK(expiry_date>manufacture_date),
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 50000), available integer NOT NULL CHECK(available>=0 AND available<=quantity),
 unit_cost numeric NOT NULL CHECK(unit_cost>0), currency public.currency_code NOT NULL,
 created_by uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(item_id,lot_number)
);
CREATE TABLE public.stock_lot_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lot_id uuid NOT NULL REFERENCES public.supplier_stock_lots(id),
 purchase_item_id uuid NOT NULL UNIQUE REFERENCES public.purchase_order_items(id),
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id), quantity integer NOT NULL CHECK(quantity>0),
 available integer NOT NULL CHECK(available>=0 AND available<=quantity), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.stock_lot_movements (
 movement_id uuid NOT NULL REFERENCES public.inventory_movements(id), receipt_id uuid NOT NULL REFERENCES public.stock_lot_receipts(id),
 order_id uuid NOT NULL REFERENCES public.orders(id), quantity integer NOT NULL CHECK(quantity<>0),
 PRIMARY KEY(movement_id,receipt_id)
);
CREATE INDEX ON public.supplier_stock_lots(supplier_id,item_id);
CREATE INDEX ON public.stock_lot_receipts(warehouse_id,lot_id);
CREATE INDEX ON public.stock_lot_movements(order_id,receipt_id);
ALTER TABLE public.supplier_stock_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_lot_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_lot_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_stock_lots,public.stock_lot_receipts,public.stock_lot_movements FROM anon,authenticated;
GRANT ALL ON public.supplier_stock_lots,public.stock_lot_receipts,public.stock_lot_movements TO service_role;
ALTER TABLE public.authenticity_batches ALTER COLUMN purchase_item_id DROP NOT NULL;
ALTER TABLE public.authenticity_batches ADD COLUMN supplier_lot_id uuid UNIQUE REFERENCES public.supplier_stock_lots(id);
ALTER TABLE public.authenticity_batches ADD CONSTRAINT authenticity_source CHECK(purchase_item_id IS NOT NULL OR supplier_lot_id IS NOT NULL);
CREATE FUNCTION public.supplier_stock_lot_create(p_supplier uuid,p_item uuid,p_lot text,p_purchase date,p_manufacture date,p_expiry date,p_cost numeric,p_currency public.currency_code,p_codes jsonb,p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer:=jsonb_array_length(p_codes); lot_id uuid; batch_id uuid; item public.inventory_items%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_active) OR NOT(public.is_admin(p_actor) OR EXISTS(SELECT 1 FROM public.supplier_user_assignments WHERE user_id=p_actor AND supplier_id=p_supplier)) THEN RAISE EXCEPTION 'Supplier access required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p_supplier AND deleted_at IS NULL AND status='ativo') THEN RAISE EXCEPTION 'Inactive supplier'; END IF;
 SELECT * INTO item FROM public.inventory_items WHERE id=p_item AND supplier_id=p_supplier;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product belongs to another supplier'; END IF;
 IF n<1 OR n>50000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_codes) c WHERE c->>'code' IS NULL OR c->>'hash' IS NULL OR (c->>'code') !~ '^[A-F0-9]{32}$' OR (c->>'hash') !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'Invalid codes'; END IF;
 INSERT INTO public.supplier_stock_lots(supplier_id,item_id,lot_number,purchase_date,manufacture_date,expiry_date,quantity,available,unit_cost,currency,created_by)
 VALUES(p_supplier,p_item,btrim(p_lot),p_purchase,p_manufacture,p_expiry,n,n,p_cost,p_currency,p_actor) RETURNING id INTO lot_id;
 INSERT INTO public.authenticity_batches(supplier_lot_id,item_id,lot_number,product_name,manufacture_date,expiry_date,quantity,created_by)
 VALUES(lot_id,item.id,btrim(p_lot),item.name,p_manufacture,p_expiry,n,p_actor) RETURNING id INTO batch_id;
 INSERT INTO public.authenticity_boxes(batch_id,serial,code_hash,print_code) SELECT batch_id,ordinality::integer,c->>'hash',c->>'code' FROM jsonb_array_elements(p_codes) WITH ORDINALITY x(c,ordinality);
 RETURN batch_id;
END $$;
REVOKE ALL ON FUNCTION public.supplier_stock_lot_create(uuid,uuid,text,date,date,date,numeric,public.currency_code,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_stock_lot_create(uuid,uuid,text,date,date,date,numeric,public.currency_code,jsonb,uuid) TO service_role;
-- Atomic receipt uses the already protected purchase routine and its stock/cost ledger.
CREATE FUNCTION public.purchase_from_supplier_lots(p_supplier uuid,p_warehouse uuid,p_currency public.currency_code,p_purchase date,p_due date,p_items jsonb,p_freight numeric,p_variable numeric,p_notes text,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE line jsonb; lot public.supplier_stock_lots%ROWTYPE; result jsonb; canonical jsonb:='[]'; q integer; pi uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_active) OR NOT public.is_admin(p_actor) THEN RAISE EXCEPTION 'Admin required'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 THEN RAISE EXCEPTION 'No items'; END IF;
 -- Fixed lock order avoids simultaneous purchases overselling or deadlocking lots.
 PERFORM 1 FROM public.supplier_stock_lots WHERE id IN(SELECT (x->>'lot_id')::uuid FROM jsonb_array_elements(p_items) x) ORDER BY id FOR UPDATE;
 FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO lot FROM public.supplier_stock_lots WHERE id=(line->>'lot_id')::uuid;
  q:=(line->>'quantity')::integer;
  IF NOT FOUND OR lot.supplier_id<>p_supplier OR lot.expiry_date<current_date OR q<1 OR q>lot.available OR (line->>'quantity')::numeric<>q OR lot.currency<>p_currency THEN RAISE EXCEPTION 'Invalid lot, currency or available quantity'; END IF;
  UPDATE public.supplier_stock_lots SET available=available-q WHERE id=lot.id;
  canonical:=canonical||jsonb_build_array(jsonb_build_object('item_id',lot.item_id,'quantity',q,'bonus_quantity',COALESCE((line->>'bonus_quantity')::numeric,0),'unit_cost',(line->>'unit_cost')::numeric));
 END LOOP;
 -- Actor is verified in the authenticated server handler; claims are transaction-local.
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 result:=public.purchase_create(p_supplier,p_warehouse,p_currency,p_purchase,p_due,canonical,p_freight,p_variable,p_notes);
 FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO lot FROM public.supplier_stock_lots WHERE id=(line->>'lot_id')::uuid;
  SELECT id INTO pi FROM public.purchase_order_items WHERE purchase_order_id=(result->>'id')::uuid AND item_id=lot.item_id AND quantity=(line->>'quantity')::integer AND unit_cost=(line->>'unit_cost')::numeric AND bonus_quantity=COALESCE((line->>'bonus_quantity')::numeric,0) AND id NOT IN(SELECT purchase_item_id FROM public.stock_lot_receipts) ORDER BY id LIMIT 1;
  IF pi IS NULL THEN RAISE EXCEPTION 'Purchase line not found'; END IF;
  q:=(line->>'quantity')::integer;
  INSERT INTO public.stock_lot_receipts(lot_id,purchase_item_id,warehouse_id,quantity,available) VALUES(lot.id,pi,p_warehouse,q,q);
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.purchase_from_supplier_lots(uuid,uuid,public.currency_code,date,date,jsonb,numeric,numeric,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_from_supplier_lots(uuid,uuid,public.currency_code,date,date,jsonb,numeric,numeric,text,uuid) TO service_role;
-- Public validation remains service-only, preserving existing first validation/history.
DO $$ DECLARE definition text; old text; replacement text; BEGIN
 definition:=pg_get_functiondef('public.authenticity_validate(uuid,text,text)'::regprocedure);
 old:='IF NOT EXISTS(SELECT 1 FROM public.authenticity_batches b JOIN public.purchase_order_items pi ON pi.id=b.purchase_item_id JOIN public.purchase_orders po ON po.id=pi.purchase_order_id WHERE b.id=p_batch AND b.active AND pi.active AND po.status<>''cancelada'')';
 replacement:='IF NOT EXISTS(SELECT 1 FROM public.authenticity_batches b WHERE b.id=p_batch AND b.active AND (b.supplier_lot_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.purchase_order_items pi JOIN public.purchase_orders po ON po.id=pi.purchase_order_id WHERE pi.id=b.purchase_item_id AND pi.active AND po.status<>''cancelada'')))';
 IF position(old in definition)=0 THEN RAISE EXCEPTION 'Unexpected validation function; review before applying'; END IF;
 EXECUTE replace(definition,old,replacement);
END $$;
-- Per-warehouse balances retain the lot through internal transfers and sale reversals.
CREATE TABLE public.stock_lot_balances (
 receipt_id uuid NOT NULL REFERENCES public.stock_lot_receipts(id), warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
 quantity integer NOT NULL CHECK(quantity>=0), PRIMARY KEY(receipt_id,warehouse_id)
);
ALTER TABLE public.stock_lot_balances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_lot_balances FROM anon,authenticated;
GRANT ALL ON public.stock_lot_balances TO service_role;
CREATE FUNCTION public.stock_lot_receipt_balance() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN INSERT INTO public.stock_lot_balances(receipt_id,warehouse_id,quantity) VALUES(NEW.id,NEW.warehouse_id,NEW.quantity); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.stock_lot_receipt_balance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_stock_lot_receipt_balance AFTER INSERT ON public.stock_lot_receipts FOR EACH ROW EXECUTE FUNCTION public.stock_lot_receipt_balance();
CREATE FUNCTION public.stock_lot_trace_movement() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE remaining integer; amount integer; source uuid; target uuid; r record; ord public.orders%ROWTYPE;
BEGIN
 IF NEW.movement_type NOT IN('saida','entrada','transferencia_saida') THEN RETURN NEW; END IF;
 remaining:=abs(NEW.quantity)::integer;
 IF abs(NEW.quantity)<>remaining THEN RETURN NEW; END IF;
 IF NEW.document_id IS NOT NULL THEN SELECT * INTO ord FROM public.orders WHERE id=NEW.document_id; END IF;
 source:=COALESCE(NEW.source_warehouse_id,ord.warehouse_id);
 target:=COALESCE(NEW.target_warehouse_id,ord.warehouse_id);
 IF NEW.movement_type='transferencia_saida' THEN
  FOR r IN SELECT bal.receipt_id,bal.quantity FROM public.stock_lot_balances bal JOIN public.stock_lot_receipts receipt ON receipt.id=bal.receipt_id JOIN public.supplier_stock_lots lot ON lot.id=receipt.lot_id WHERE bal.warehouse_id=source AND lot.item_id=NEW.item_id AND bal.quantity>0 ORDER BY lot.expiry_date,lot.created_at,receipt.id FOR UPDATE OF bal LOOP
   amount:=least(remaining,r.quantity); EXIT WHEN amount<=0;
   UPDATE public.stock_lot_balances SET quantity=quantity-amount WHERE receipt_id=r.receipt_id AND warehouse_id=source;
   INSERT INTO public.stock_lot_balances(receipt_id,warehouse_id,quantity) VALUES(r.receipt_id,target,amount) ON CONFLICT(receipt_id,warehouse_id) DO UPDATE SET quantity=public.stock_lot_balances.quantity+EXCLUDED.quantity;
   remaining:=remaining-amount;
  END LOOP;
 ELSIF ord.id IS NOT NULL AND NEW.movement_type='saida' THEN
  FOR r IN SELECT bal.receipt_id,bal.quantity FROM public.stock_lot_balances bal JOIN public.stock_lot_receipts receipt ON receipt.id=bal.receipt_id JOIN public.supplier_stock_lots lot ON lot.id=receipt.lot_id WHERE bal.warehouse_id=source AND lot.item_id=NEW.item_id AND bal.quantity>0 ORDER BY lot.expiry_date,lot.created_at,receipt.id FOR UPDATE OF bal LOOP
   amount:=least(remaining,r.quantity); EXIT WHEN amount<=0;
   UPDATE public.stock_lot_balances SET quantity=quantity-amount WHERE receipt_id=r.receipt_id AND warehouse_id=source;
   UPDATE public.stock_lot_receipts SET available=available-amount WHERE id=r.receipt_id;
   INSERT INTO public.stock_lot_movements(movement_id,receipt_id,order_id,quantity) VALUES(NEW.id,r.receipt_id,ord.id,amount);
   remaining:=remaining-amount;
  END LOOP;
 ELSIF ord.id IS NOT NULL AND NEW.movement_type='entrada' AND NEW.reason ILIKE '%estorno%' THEN
  FOR r IN SELECT m.receipt_id,sum(m.quantity)::integer AS quantity FROM public.stock_lot_movements m JOIN public.stock_lot_receipts receipt ON receipt.id=m.receipt_id JOIN public.supplier_stock_lots lot ON lot.id=receipt.lot_id WHERE m.order_id=ord.id AND lot.item_id=NEW.item_id GROUP BY m.receipt_id HAVING sum(m.quantity)>0 ORDER BY m.receipt_id LOOP
   amount:=least(remaining,r.quantity); EXIT WHEN amount<=0;
   PERFORM 1 FROM public.stock_lot_receipts WHERE id=r.receipt_id FOR UPDATE;
   INSERT INTO public.stock_lot_balances(receipt_id,warehouse_id,quantity) VALUES(r.receipt_id,target,amount) ON CONFLICT(receipt_id,warehouse_id) DO UPDATE SET quantity=public.stock_lot_balances.quantity+EXCLUDED.quantity;
   UPDATE public.stock_lot_receipts SET available=available+amount WHERE id=r.receipt_id;
   INSERT INTO public.stock_lot_movements(movement_id,receipt_id,order_id,quantity) VALUES(NEW.id,r.receipt_id,ord.id,-amount);
   remaining:=remaining-amount;
  END LOOP;
 END IF;
 IF ord.id IS NOT NULL THEN PERFORM public.purchase_sync_sales_payment(ord.id); END IF;
 -- Unidentified historical stock remains unidentified; never invent a source lot.
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stock_lot_trace_movement() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_stock_lot_trace_movement AFTER INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.stock_lot_trace_movement();
-- Only new, identified stock is exempt from generating a duplicate supplier purchase.
CREATE FUNCTION public.order_item_has_stock_lot(p_order uuid,p_item uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT COALESCE((SELECT o.created_at >= min(r.created_at) AND (
   COALESCE((SELECT sum(m.quantity) FROM public.stock_lot_movements m JOIN public.stock_lot_receipts mr ON mr.id=m.receipt_id JOIN public.supplier_stock_lots ml ON ml.id=mr.lot_id WHERE m.order_id=o.id AND ml.item_id=p_item),0) >= (SELECT sum(quantity) FROM public.order_items WHERE order_id=o.id AND item_id=p_item)
   OR COALESCE((SELECT sum(b.quantity) FROM public.stock_lot_balances b JOIN public.stock_lot_receipts br ON br.id=b.receipt_id JOIN public.supplier_stock_lots bl ON bl.id=br.lot_id WHERE b.warehouse_id=o.warehouse_id AND bl.item_id=p_item),0) >= (SELECT sum(quantity) FROM public.order_items WHERE order_id=o.id AND item_id=p_item)
 ) FROM public.orders o JOIN public.stock_lot_balances rb ON rb.warehouse_id=o.warehouse_id JOIN public.stock_lot_receipts r ON r.id=rb.receipt_id JOIN public.supplier_stock_lots l ON l.id=r.lot_id AND l.item_id=p_item WHERE o.id=p_order GROUP BY o.id,o.created_at),false);
$$;
REVOKE ALL ON FUNCTION public.order_item_has_stock_lot(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.order_item_has_stock_lot(uuid,uuid) TO service_role;
DO $$ DECLARE definition text; anchor text:='WHERE oi.order_id = sales_order.id'; BEGIN
 definition:=pg_get_functiondef('public.purchase_sync_from_sales_order(uuid)'::regprocedure);
 IF position(anchor in definition)=0 THEN RAISE EXCEPTION 'Unexpected purchase sync; review before applying'; END IF;
 EXECUTE replace(definition,anchor,anchor || E'\n AND NOT public.order_item_has_stock_lot(oi.order_id,oi.item_id)');
END $$;
-- Linked receipts settle only the cost of units sold and actually received from clients.
DO $$ DECLARE definition text; anchor text; replacement text; BEGIN
 definition:=pg_get_functiondef('public.purchase_sync_sales_payment(uuid)'::regprocedure);
 -- Match deployed formatting without altering unrelated bookkeeping logic.
 anchor:='WHERE source_order_id=sales.id AND source_type=''sales_order'' AND status<>''cancelada''';
 replacement:='WHERE status<>''cancelada'' AND ((source_order_id=sales.id AND source_type=''sales_order'') OR EXISTS(SELECT 1 FROM public.stock_lot_receipts sr JOIN public.purchase_order_items si ON si.id=sr.purchase_item_id JOIN public.stock_lot_movements sm ON sm.receipt_id=sr.id WHERE si.purchase_order_id=public.purchase_orders.id AND sm.order_id=sales.id))';
 IF position(anchor in definition)=0 THEN RAISE EXCEPTION 'Unexpected payment sync; review before applying'; END IF;
 definition:=replace(definition,anchor,replacement);
 anchor:='target_paid:=round(purchase.total*ratio,2);';
 replacement:=anchor || E'\n IF purchase.source_type<>''sales_order'' THEN\n SELECT round(purchase.total * COALESCE(sum(si.total * least(1,greatest(0,COALESCE((SELECT sum(sm.quantity * least(1,greatest(0,COALESCE(so.amount_paid,0)/NULLIF(so.total,0)))) FROM public.stock_lot_movements sm JOIN public.orders so ON so.id=sm.order_id WHERE sm.receipt_id=sr.id AND so.deleted_at IS NULL AND so.superseded_at IS NULL AND so.status<>''cancelado'' AND so.workflow_stage<>''cancelado''),0)/NULLIF(sr.quantity,0)))),0) / NULLIF(purchase.merchandise_total,0),2) INTO target_paid FROM public.stock_lot_receipts sr JOIN public.purchase_order_items si ON si.id=sr.purchase_item_id WHERE si.purchase_order_id=purchase.id;\n target_paid:=COALESCE(target_paid,0);\n END IF;';
 IF position(anchor in definition)=0 THEN RAISE EXCEPTION 'Unexpected payment target; review before applying'; END IF;
 EXECUTE replace(definition,anchor,replacement);
END $$;
