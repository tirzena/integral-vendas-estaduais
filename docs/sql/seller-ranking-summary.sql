
-- Ranking exposes aggregates, never other sellers' raw orders or financial values.
create or replace function private.integral_ranking_summary(p_from timestamptz default null, p_product_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare actor uuid:=auth.uid(); company boolean; result jsonb;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and is_active)
   or not exists(select 1 from public.user_roles where user_id=actor and role in ('admin','superadmin','gestor','financeiro','vendedor','estoque')) then
   raise exception using errcode='42501',message='Acesso ao ranking não autorizado.';
 end if;
 company:=public.sales_sees_all(actor) and exists(select 1 from public.get_my_capabilities() capability where capability='company_sales');
 if p_product_id is not null and not company and not public.has_product_access(actor,p_product_id) then
   raise exception using errcode='42501',message='Categoria não liberada para este perfil.';
 end if;
 with competitors as (
   select p.id,coalesce(nullif(p.full_name,''),'Vendedor') name from public.profiles p
   where p.is_active and exists(select 1 from public.user_roles r where r.user_id=p.id and r.role='vendedor')
   and p.id not in ('cf25abd8-ed9d-438d-8b09-85e27a71e808'::uuid,'90a39e4e-4529-4929-b682-33377cf34080'::uuid,'2046cc11-d5f8-4e23-b813-222b3e56a662'::uuid,'28d111b5-1d7d-4555-8c9d-4b5d04fea4b8'::uuid,'60f8d872-1e03-4fa3-bd85-f50dd17140cd'::uuid)
 ), eligible as (
   select o.*,coalesce(o.order_date::timestamp at time zone 'America/Sao_Paulo',o.created_at) effective_at
   from public.orders o join competitors c on c.id=o.seller_id
   where o.deleted_at is null and o.superseded_at is null and o.replacement_for_order_id is null
     and coalesce(o.approval_status,'approved')='approved'
     and coalesce(o.customer_resolution,'')<>'credit' and o.status<>'cancelado'
     and coalesce(o.workflow_stage,'')<>'cancelado'
 ), scoped_lines as (
   select l.*,o.seller_id,o.status,o.currency from public.order_items l join eligible o on o.id=l.order_id
   left join public.inventory_items i on i.id=l.item_id
   where (p_from is null or o.effective_at>=p_from) and o.effective_at<=now()
     and (p_product_id is null or i.product_id=p_product_id or (i.product_id is null and o.product_id=p_product_id))
 ), scoped_orders as (
   select o.id,o.seller_id,o.status,o.currency,
     case when p_product_id is null then o.total
       when not exists(select 1 from public.order_items l where l.order_id=o.id) then o.total
       else (select sum(l.total) from scoped_lines l where l.order_id=o.id) end total
   from eligible o where (p_from is null or o.effective_at>=p_from) and o.effective_at<=now()
   and (p_product_id is null or exists(select 1 from scoped_lines l where l.order_id=o.id)
      or (o.product_id=p_product_id and not exists(select 1 from public.order_items l where l.order_id=o.id)))
 ), counts as (
   select seller_id,count(*) orders,count(*) filter(where status in ('faturado','enviado','entregue')) sales
   from scoped_orders group by seller_id
 ), unit_totals as (
   select seller_id,sum(quantity) units from scoped_lines where status in ('faturado','enviado','entregue') group by seller_id
 ), revenues as (
   select seller_id,jsonb_agg(jsonb_build_object('currency',currency,'amount',amount)) amounts from (
     select seller_id,currency,sum(total) amount from scoped_orders where status in ('faturado','enviado','entregue') group by seller_id,currency
   ) x group by seller_id
 ), bonuses as (
   select user_id,jsonb_agg(jsonb_build_object('currency',currency,'amount',amount)) amounts from (
     select a.user_id,a.currency,sum(a.amount) amount from public.bonus_awards a join competitors c on c.id=a.user_id
     where (p_from is null or a.created_at>=p_from) and a.created_at<=now()
     and (company or a.user_id=actor) group by a.user_id,a.currency
   ) x group by user_id
 ), product_totals as (
   select seller_id,jsonb_agg(jsonb_build_object('id',id,'name',name,'sales',sales,'units',units) order by units desc,sales desc) products from (
     select l.seller_id,coalesce(l.item_id::text,l.description||':'||l.id::text) id,
       coalesce(nullif(max(l.description),''),'Produto sem nome') name,count(distinct l.order_id) sales,sum(l.quantity) units
     from scoped_lines l where l.status in ('faturado','enviado','entregue')
       and (company or l.seller_id=actor)
     group by l.seller_id,coalesce(l.item_id::text,l.description||':'||l.id::text)
   ) x group by seller_id
 )
 select coalesce(jsonb_agg(jsonb_build_object('userId',c.id,'name',c.name,'orders',coalesce(n.orders,0),
   'sales',coalesce(n.sales,0),'units',coalesce(u.units,0),
   'revenue',case when company or c.id=actor then coalesce(r.amounts,'[]'::jsonb) else null end,
   'bonus',case when company or c.id=actor then coalesce(b.amounts,'[]'::jsonb) else null end,
   'canSeeMoney',(company or c.id=actor),'products',coalesce(t.products,'[]'::jsonb)) order by coalesce(u.units,0) desc,coalesce(n.sales,0) desc,c.name),'[]'::jsonb)
 into result from competitors c left join counts n on n.seller_id=c.id left join unit_totals u on u.seller_id=c.id
 left join revenues r on r.seller_id=c.id left join bonuses b on b.user_id=c.id left join product_totals t on t.seller_id=c.id;
 return result;
end
$fn$;
revoke all on function private.integral_ranking_summary(timestamptz,uuid) from public,anon;
grant execute on function private.integral_ranking_summary(timestamptz,uuid) to authenticated;
create or replace function public.integral_ranking_summary(p_from timestamptz default null,p_product_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $fn$
 select private.integral_ranking_summary(p_from,p_product_id)
$fn$;
revoke all on function public.integral_ranking_summary(timestamptz,uuid) from public,anon;
grant execute on function public.integral_ranking_summary(timestamptz,uuid) to authenticated;
comment on function public.integral_ranking_summary(timestamptz,uuid) is 'Active competing sellers with approved-order counts and units; money and product details restricted to own seller or company_sales. No raw order, contact or role directory data.';
