ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'cidade',
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

DO $$ BEGIN
  ALTER TABLE public.warehouses ADD CONSTRAINT warehouses_level_check
    CHECK (level IN ('principal','estado','cidade'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.warehouses SET level = 'principal'
WHERE name = 'Estoque principal' AND parent_id IS NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  reserved numeric(14,3) NOT NULL DEFAULT 0,
  min_quantity numeric(14,3) NOT NULL DEFAULT 0,
  location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id,item_id),
  CHECK (quantity >= 0 AND reserved >= 0 AND reserved <= quantity)
);

GRANT SELECT,INSERT,UPDATE,DELETE ON public.warehouse_inventory TO authenticated;
GRANT ALL ON public.warehouse_inventory TO service_role;
ALTER TABLE public.warehouse_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS warehouse_inventory_read ON public.warehouse_inventory;
CREATE POLICY warehouse_inventory_read ON public.warehouse_inventory FOR SELECT TO authenticated
  USING (public.app_has_cap(auth.uid(),'inventory_view'));
DROP POLICY IF EXISTS warehouse_inventory_manage ON public.warehouse_inventory;
CREATE POLICY warehouse_inventory_manage ON public.warehouse_inventory FOR ALL TO authenticated
  USING (public.app_has_cap(auth.uid(),'inventory_manage'))
  WITH CHECK (public.app_has_cap(auth.uid(),'inventory_manage'));

INSERT INTO public.warehouse_inventory(warehouse_id,item_id,quantity,reserved,min_quantity,location)
SELECT l.warehouse_id,i.id,i.quantity,i.reserved,i.min_quantity,l.location
FROM public.inventory_items i
JOIN public.inventory_item_locations l ON l.item_id=i.id
WHERE l.warehouse_id IS NOT NULL
ON CONFLICT (warehouse_id,item_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_inventory_item_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_item uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.item_id ELSE NEW.item_id END;
BEGIN
  UPDATE public.inventory_items i SET
    quantity=coalesce((SELECT sum(w.quantity) FROM public.warehouse_inventory w WHERE w.item_id=target_item),0),
    reserved=coalesce((SELECT sum(w.reserved) FROM public.warehouse_inventory w WHERE w.item_id=target_item),0),
    updated_at=now()
  WHERE i.id=target_item;
  RETURN coalesce(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS trg_sync_inventory_item_totals ON public.warehouse_inventory;
CREATE TRIGGER trg_sync_inventory_item_totals AFTER INSERT OR UPDATE OR DELETE ON public.warehouse_inventory
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_item_totals();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS return_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.sales_update_order_logistics(
  p_order_id uuid,p_warehouse_id uuid,p_address text,p_city text,p_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; line record; bal public.warehouse_inventory%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.sales_can_manage(uid,o.seller_id) THEN RAISE EXCEPTION 'Sem permissão para alterar o pedido.'; END IF;
  IF p_warehouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id=p_warehouse_id AND is_active) THEN
    RAISE EXCEPTION 'Estoque inválido ou inativo.';
  END IF;

  IF p_warehouse_id IS DISTINCT FROM o.warehouse_id AND o.stock_state IN ('reservado','baixado') THEN
    FOR line IN SELECT item_id,quantity FROM public.order_items WHERE order_id=p_order_id AND item_id IS NOT NULL LOOP
      IF o.warehouse_id IS NOT NULL THEN
        IF o.stock_state='reservado' THEN
          UPDATE public.warehouse_inventory SET reserved=greatest(0,reserved-line.quantity),updated_at=now()
          WHERE warehouse_id=o.warehouse_id AND item_id=line.item_id;
        ELSE
          UPDATE public.warehouse_inventory SET quantity=quantity+line.quantity,updated_at=now()
          WHERE warehouse_id=o.warehouse_id AND item_id=line.item_id;
        END IF;
      END IF;
      IF p_warehouse_id IS NOT NULL THEN
        SELECT * INTO bal FROM public.warehouse_inventory WHERE warehouse_id=p_warehouse_id AND item_id=line.item_id FOR UPDATE;
        IF NOT FOUND OR bal.quantity-bal.reserved < line.quantity THEN
          RAISE EXCEPTION 'Estoque selecionado sem saldo suficiente para um dos produtos.';
        END IF;
        IF o.stock_state='reservado' THEN
          UPDATE public.warehouse_inventory SET reserved=reserved+line.quantity,updated_at=now()
          WHERE warehouse_id=p_warehouse_id AND item_id=line.item_id;
        ELSE
          UPDATE public.warehouse_inventory SET quantity=quantity-line.quantity,updated_at=now()
          WHERE warehouse_id=p_warehouse_id AND item_id=line.item_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.orders SET warehouse_id=p_warehouse_id,shipping_address=nullif(btrim(p_address),''),
    shipping_city=nullif(btrim(p_city),''),shipping_state=nullif(btrim(p_state),'') WHERE id=p_order_id;
  RETURN jsonb_build_object('id',p_order_id,'updated',true);
END $$;

CREATE OR REPLACE FUNCTION public.sales_set_cancel_return_warehouse(p_order_id uuid,p_warehouse_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id;
  IF uid IS NULL OR NOT FOUND OR NOT public.sales_can_manage(uid,o.seller_id) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id=p_warehouse_id AND is_active) THEN RAISE EXCEPTION 'Estoque de devolução inválido.'; END IF;
  UPDATE public.orders SET return_warehouse_id=p_warehouse_id WHERE id=p_order_id;
END $$;

CREATE OR REPLACE FUNCTION public.restore_warehouse_stock_on_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE line record; target uuid;
BEGIN
  IF NEW.status='cancelado' AND OLD.status IS DISTINCT FROM 'cancelado' THEN
    target:=coalesce(NEW.return_warehouse_id,OLD.warehouse_id);
    IF target IS NOT NULL THEN
      FOR line IN SELECT item_id,quantity FROM public.order_items WHERE order_id=OLD.id AND item_id IS NOT NULL LOOP
        INSERT INTO public.warehouse_inventory(warehouse_id,item_id,quantity,reserved)
        VALUES(target,line.item_id,CASE WHEN OLD.stock_state='baixado' THEN line.quantity ELSE 0 END,0)
        ON CONFLICT (warehouse_id,item_id) DO UPDATE SET
          quantity=public.warehouse_inventory.quantity + CASE WHEN OLD.stock_state='baixado' THEN line.quantity ELSE 0 END,
          reserved=greatest(0,public.warehouse_inventory.reserved - CASE WHEN OLD.stock_state='reservado' THEN line.quantity ELSE 0 END),
          updated_at=now();
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_restore_warehouse_stock_on_cancel ON public.orders;
CREATE TRIGGER trg_restore_warehouse_stock_on_cancel BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.restore_warehouse_stock_on_cancel();

REVOKE ALL ON FUNCTION public.sales_set_cancel_return_warehouse(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_set_cancel_return_warehouse(uuid,uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.sales_warehouses();
CREATE FUNCTION public.sales_warehouses()
RETURNS TABLE(id uuid,name text,city text,state text,country text,parent_id uuid,level text,latitude double precision,longitude double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT w.id,w.name,w.city,w.state,w.country,w.parent_id,w.level,w.latitude,w.longitude
  FROM public.warehouses w
  WHERE auth.uid() IS NOT NULL AND w.is_active
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid())
  ORDER BY CASE w.level WHEN 'principal' THEN 1 WHEN 'estado' THEN 2 ELSE 3 END,w.state,w.city,w.name
$$;
REVOKE ALL ON FUNCTION public.sales_warehouses() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_warehouses() TO authenticated;
