
-- Narrow, read-only seller availability: no address, city, bin, coordinates, costs or suppliers.
create or replace function private.integral_seller_stock_availability()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare actor uuid:=private.seller_require_actor(); result jsonb;
begin
 with stock_locations as (
  select w.id,coalesce(nullif(w.state,''),'Estado não informado') state,w.country,w.level
  from public.warehouses w where w.is_active
   and (public.is_admin(w.created_by) or (w.created_by is null and w.level='principal'))
 ), allowed as (
  select i.id,i.name,i.variation,i.product_id,i.category_id
  from public.inventory_items i where private.seller_item_allowed(actor,i.id)
 ), balances as (
  select wi.warehouse_id,wi.item_id,greatest(0,wi.quantity-wi.reserved) quantity
  from public.warehouse_inventory wi join stock_locations w on w.id=wi.warehouse_id join allowed i on i.id=wi.item_id
 )
 select jsonb_build_object('canSeeCost',false,
  'warehouses',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name','Estoque em '||w.state,'state',w.state,'country',w.country,'level',w.level) order by w.state) from stock_locations w),'[]'::jsonb),
  'inventory',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('quantity',coalesce((select sum(b.quantity) from balances b where b.item_id=i.id),0)) order by i.name) from allowed i),'[]'::jsonb),
  'balances',coalesce((select jsonb_agg(b) from balances b),'[]'::jsonb)) into result;
 return result;
end $fn$;
revoke all on function private.integral_seller_stock_availability() from public,anon;
grant execute on function private.integral_seller_stock_availability() to authenticated;
create or replace function public.integral_seller_stock_availability()
returns jsonb language sql stable security invoker set search_path='' as $fn$
 select private.integral_seller_stock_availability()
$fn$;
revoke all on function public.integral_seller_stock_availability() from public,anon;
grant execute on function public.integral_seller_stock_availability() to authenticated;
comment on function public.integral_seller_stock_availability() is 'Sellers can consult allowed products and available quantities in administrator-created stocks; location only at state level. No write operations.';

create or replace function private.integral_dashboard_stock()
returns jsonb language sql stable security invoker set search_path='' as $fn$
 select private.integral_seller_stock_availability()
$fn$;
CREATE OR REPLACE FUNCTION public.seller_portal_data(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid; result jsonb;
BEGIN
 v_actor:=auth.uid();
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required.'; END IF;
 IF p_user_id IS NOT NULL AND p_user_id<>v_actor THEN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Admin preview only.'; END IF;
  v_actor:=p_user_id;
 END IF;
 IF NOT private.seller_is_restricted(v_actor) OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.is_active)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Active restricted seller required.'; END IF;
 SELECT jsonb_build_object(
 'user_id',v_actor,
 'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'image_url',p.image_url,'currency',p.main_currency) ORDER BY p.name)
 FROM public.products p WHERE p.is_active AND p.deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.product_users pu WHERE pu.user_id=v_actor AND pu.product_id=p.id)),'[]'::jsonb),
 'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'product_id',c.product_id,'name',c.name,'image_url',c.image_url) ORDER BY c.name)
 FROM public.product_categories c WHERE EXISTS(SELECT 1 FROM public.product_users pu JOIN public.products p ON p.id=pu.product_id WHERE pu.user_id=v_actor AND pu.product_id=c.product_id AND p.is_active AND p.deleted_at IS NULL)
 AND (EXISTS(SELECT 1 FROM public.product_category_users g WHERE g.user_id=v_actor AND g.category_id=c.id)
 OR EXISTS(SELECT 1 FROM public.inventory_items i WHERE i.category_id=c.id AND private.seller_item_allowed(v_actor,i.id)))),'[]'::jsonb),
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'category_id',i.category_id,
 'name',i.name,'sku',i.sku,'barcode',i.barcode,'unit',i.unit,'image_url',i.image_url,'currency',i.currency,
 'price',i.price,'max_discount_percent',i.max_discount_percent,'available',greatest(0,i.quantity-i.reserved)) ORDER BY i.name)
 FROM public.inventory_items i WHERE private.seller_item_allowed(v_actor,i.id)),'[]'::jsonb),
 'warehouses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'name',w.name)) FROM public.warehouses w WHERE w.is_active AND (NOT EXISTS(SELECT 1 FROM public.integral_member_rules WHERE user_id=v_actor) OR EXISTS(SELECT 1 FROM public.warehouse_user_assignments wa WHERE wa.user_id=v_actor AND wa.warehouse_id=w.id))
 AND EXISTS(SELECT 1 FROM public.warehouse_inventory wi WHERE wi.warehouse_id=w.id AND wi.quantity>wi.reserved AND private.seller_item_allowed(v_actor,wi.item_id))),'[]'::jsonb),
 'orders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'number',o.number,'date',o.order_date,'currency',o.currency,
 'kind',o.kind,'status',o.status,'stage',o.workflow_stage,'total',o.total,'shipping_cost',o.shipping_cost,'paid',o.amount_paid,'receivable',o.amount_receivable,
 'pending_receipt',coalesce((SELECT sum(p.amount) FROM public.payments p WHERE p.order_id=o.id AND p.status='pendente'),0),
 'customer_name',coalesce(o.delivery->>'customer_name',c.name),'recipient_name',o.delivery_recipient_name,
 'exchange',jsonb_build_object('base',o.currency,'USD',o.exchange_rates_snapshot->'USD','BRL',o.exchange_rates_snapshot->'BRL','PYG',o.exchange_rates_snapshot->'PYG'),
 'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'item_id',l.item_id,'description',l.description,
 'quantity',l.quantity,'unit_price',l.unit_price,'discount',l.discount,'total',l.total,'commission_percent',l.commission_percent,'commission_amount',l.commission_amount)) FROM public.order_items l WHERE l.order_id=o.id),'[]'::jsonb),
 'payments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'currency',p.currency,'method',p.method,'status',p.status,
 'paid_at',p.paid_at,'received_amount',p.received_amount,'received_currency',p.received_currency,
 'proofs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',proof.id,'type',proof.proof_type,'url',proof.external_url))
 FROM public.order_payment_proofs proof WHERE proof.payment_id=p.id AND proof.order_id=o.id),'[]'::jsonb))) FROM public.payments p WHERE p.order_id=o.id),'[]'::jsonb),
 'commission_total',o.commission_total) ORDER BY o.order_date DESC,o.number DESC)
 FROM public.orders o LEFT JOIN public.customers c ON c.id=o.customer_id
 WHERE o.seller_id=v_actor AND o.deleted_at IS NULL AND o.superseded_at IS NULL),'[]'::jsonb),
 'earnings',jsonb_build_object(
 'compensations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'type',m.comp_type,'amount',m.amount,'currency',m.currency,'period',m.period,'active',m.active)) FROM public.member_compensations m WHERE m.user_id=v_actor),'[]'::jsonb),
 'payroll',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'currency',p.currency,'status',p.status,'date',p.paid_at,'type',p.entry_type,'period_start',p.period_start,'period_end',p.period_end)) FROM public.payroll_entries p WHERE p.user_id=v_actor),'[]'::jsonb),
 'bonuses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'amount',b.amount,'currency',b.currency,'status',b.status)) FROM public.bonus_awards b WHERE b.user_id=v_actor),'[]'::jsonb),
 'withdrawals',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'currency',p.currency,'status',p.status,'date',p.paid_at,'type',p.entry_type))
 FROM public.payroll_entries p WHERE p.user_id=v_actor AND p.entry_type IN ('commission','comissao','bonus','bonificacao')),'[]'::jsonb)),

 'championships',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'destination',c.destination,
 'starts_at',c.starts_at,'ends_at',c.ends_at,'individual_goal',c.individual_goal,'team_goal',c.team_goal,
 'counting_mode',c.counting_mode,'team_prize',c.team_prize,
 'own_units',coalesce((SELECT (m->>'units')::numeric FROM jsonb_array_elements(standing.data->'members') m WHERE m->>'id'=v_actor::text),0),
 'members',coalesce((SELECT jsonb_agg(jsonb_build_object('name',s.name,'units',s.units,'rank',s.position) ORDER BY s.position,s.name)
 FROM (SELECT m->>'name' name,(m->>'units')::numeric units,dense_rank() OVER(ORDER BY (m->>'units')::numeric DESC) position
 FROM jsonb_array_elements(standing.data->'members') m) s),'[]'::jsonb),
 'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('name',s.name,'units',s.units,'rank',s.position) ORDER BY s.position,s.name)
 FROM (SELECT m->>'name' name,(m->>'units')::numeric units,dense_rank() OVER(ORDER BY (m->>'units')::numeric DESC) position
 FROM jsonb_array_elements(standing.data->'teams') m) s),'[]'::jsonb),
 'media',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m->>'id','kind',m->>'kind','url',m->>'url','title',m->>'title'))
 FROM jsonb_array_elements(c.media) m WHERE m->>'kind' IN ('image','video','youtube')
 AND (m->>'url' ~ '^https://' OR m->>'url' ~ '^/[^/]')),'[]'::jsonb)
 ) ORDER BY c.starts_at)
 FROM public.ranking_championships c CROSS JOIN LATERAL (
 SELECT private.seller_legacy_ranking_championship_standings(c.id) data) standing WHERE c.enabled),'[]'::jsonb),

 -- Intentionally only name, units and rank: no member UUID, money, profile,
 -- team, commission, contact, avatar or order details.
 'ranking',coalesce((SELECT jsonb_agg(jsonb_build_object('rank',r.position,'name',r.full_name,'units',r.units) ORDER BY r.position)
 FROM (SELECT pr.full_name,s.units,dense_rank() OVER(ORDER BY s.units DESC) position
 FROM (SELECT o.seller_id,sum(l.quantity) units FROM public.orders o JOIN public.order_items l ON l.order_id=o.id
 WHERE o.seller_id NOT IN ('cf25abd8-ed9d-438d-8b09-85e27a71e808'::uuid,'90a39e4e-4529-4929-b682-33377cf34080'::uuid) AND EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=o.seller_id AND ur.role='vendedor') AND EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.id=o.seller_id AND pr.is_active) AND o.kind='venda' AND o.deleted_at IS NULL AND o.superseded_at IS NULL AND o.status<>'cancelado'
 AND o.workflow_stage NOT IN ('cancelado','rascunho','solicitacao_catalogo','perdido') GROUP BY o.seller_id) s
 JOIN public.profiles pr ON pr.id=s.seller_id) r),'[]'::jsonb)
 ) INTO result;
 result:=jsonb_set(result,'{warehouses}',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'name','Estoque em '||coalesce(nullif(w.state,''),'Estado não informado'),'state',w.state,'country',w.country,'level',w.level) ORDER BY w.state) FROM public.warehouses w WHERE w.is_active AND (public.is_admin(w.created_by) OR (w.created_by IS NULL AND w.level='principal'))),'[]'::jsonb));
 RETURN result;
END $function$
;
alter policy seller_portal_read on public.warehouse_inventory using (not private.seller_is_restricted((select auth.uid())));

CREATE OR REPLACE FUNCTION public.inventory_replenish(p_target_warehouse_id uuid, p_item_id uuid, p_quantity numeric, p_bonus_quantity numeric DEFAULT 0, p_min_quantity numeric DEFAULT 0, p_location text DEFAULT NULL::text, p_source_warehouse_id uuid DEFAULT NULL::uuid, p_unit_cost numeric DEFAULT NULL::numeric, p_freight_cost numeric DEFAULT 0, p_variable_cost numeric DEFAULT 0, p_currency currency_code DEFAULT 'USD'::currency_code, p_payment_status text DEFAULT 'pendente'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Somente administradores podem comprar ou alterar estoques.'; END IF;
 IF private.seller_is_restricted(auth.uid()) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Use the seller portal RPC.'; END IF;
RETURN private.seller_legacy_inventory_replenish($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12);
END$function$
;
CREATE OR REPLACE FUNCTION public.purchase_create(p_supplier_id uuid, p_warehouse_id uuid, p_currency currency_code, p_purchase_date date, p_due_date date, p_items jsonb, p_freight_cost numeric DEFAULT 0, p_variable_cost numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Somente administradores podem comprar ou alterar estoques.'; END IF;
 IF private.seller_is_restricted(auth.uid()) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Use the seller portal RPC.'; END IF;
RETURN private.seller_legacy_purchase_create($1,$2,$3,$4,$5,$6,$7,$8,$9);
END$function$
;

create policy admin_manual_stock_insert on public.warehouses as restrictive for insert to authenticated with check (public.is_admin((select auth.uid())));
create policy admin_manual_stock_update on public.warehouses as restrictive for update to authenticated using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
create policy admin_manual_stock_delete on public.warehouses as restrictive for delete to authenticated using (public.is_admin((select auth.uid())));
create policy admin_manual_stock_insert on public.warehouse_inventory as restrictive for insert to authenticated with check (public.is_admin((select auth.uid())));
create policy admin_manual_stock_update on public.warehouse_inventory as restrictive for update to authenticated using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
create policy admin_manual_stock_delete on public.warehouse_inventory as restrictive for delete to authenticated using (public.is_admin((select auth.uid())));
create policy admin_manual_stock_insert on public.inventory_item_locations as restrictive for insert to authenticated with check (public.is_admin((select auth.uid())));
create policy admin_manual_stock_update on public.inventory_item_locations as restrictive for update to authenticated using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
create policy admin_manual_stock_delete on public.inventory_item_locations as restrictive for delete to authenticated using (public.is_admin((select auth.uid())));
create policy admin_manual_stock_insert on public.inventory_movements as restrictive for insert to authenticated with check (public.is_admin((select auth.uid())));
create policy admin_manual_stock_update on public.inventory_movements as restrictive for update to authenticated using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
create policy admin_manual_stock_delete on public.inventory_movements as restrictive for delete to authenticated using (public.is_admin((select auth.uid())));

create policy admin_manual_stock_insert on public.inventory_items as restrictive for insert to authenticated with check (public.is_admin((select auth.uid())));
create policy admin_manual_stock_update on public.inventory_items as restrictive for update to authenticated using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
create policy admin_manual_stock_delete on public.inventory_items as restrictive for delete to authenticated using (public.is_admin((select auth.uid())));

CREATE OR REPLACE FUNCTION public.purchase_from_supplier_lots(p_supplier uuid, p_warehouse uuid, p_currency currency_code, p_purchase date, p_due date, p_items jsonb, p_freight numeric, p_variable numeric, p_notes text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND (auth.uid() IS DISTINCT FROM p_actor OR NOT public.is_admin(auth.uid())) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Somente administradores podem registrar compras para o estoque.'; END IF;
 IF private.seller_is_restricted(auth.uid()) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Use the seller portal RPC.'; END IF;

DECLARE line jsonb; lot public.supplier_stock_lots%ROWTYPE; result jsonb; canonical jsonb:='[]'; q integer; pi uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_active) OR NOT public.is_admin(p_actor) THEN RAISE EXCEPTION 'Admin required'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 THEN RAISE EXCEPTION 'No items'; END IF;
 PERFORM 1 FROM public.supplier_stock_lots WHERE id IN(SELECT (x->>'lot_id')::uuid FROM jsonb_array_elements(p_items) x) ORDER BY id FOR UPDATE;
 FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
 SELECT * INTO lot FROM public.supplier_stock_lots WHERE id=(line->>'lot_id')::uuid; q:=(line->>'quantity')::integer;
 IF NOT FOUND OR lot.supplier_id<>p_supplier OR lot.expiry_date<current_date OR q<1 OR q>lot.available OR (line->>'quantity')::numeric<>q OR lot.currency<>p_currency THEN RAISE EXCEPTION 'Invalid lot, currency or available quantity'; END IF;
 UPDATE public.supplier_stock_lots SET available=available-q WHERE id=lot.id;
 canonical:=canonical||jsonb_build_array(jsonb_build_object('item_id',lot.item_id,'quantity',q,'bonus_quantity',COALESCE((line->>'bonus_quantity')::numeric,0),'unit_cost',(line->>'unit_cost')::numeric)); END LOOP;
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true); PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 result:=public.purchase_create(p_supplier,p_warehouse,p_currency,p_purchase,p_due,canonical,p_freight,p_variable,p_notes);
 FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
 SELECT * INTO lot FROM public.supplier_stock_lots WHERE id=(line->>'lot_id')::uuid;
 SELECT id INTO pi FROM public.purchase_order_items WHERE purchase_order_id=(result->>'id')::uuid AND item_id=lot.item_id AND quantity=(line->>'quantity')::integer AND unit_cost=(line->>'unit_cost')::numeric AND bonus_quantity=COALESCE((line->>'bonus_quantity')::numeric,0) AND id NOT IN(SELECT purchase_item_id FROM public.stock_lot_receipts) ORDER BY id LIMIT 1;
 IF pi IS NULL THEN RAISE EXCEPTION 'Purchase line not found'; END IF;
 q:=(line->>'quantity')::integer; INSERT INTO public.stock_lot_receipts(lot_id,purchase_item_id,warehouse_id,quantity,available) VALUES(lot.id,pi,p_warehouse,q,q); END LOOP; RETURN result;
END ;
END$function$
;
