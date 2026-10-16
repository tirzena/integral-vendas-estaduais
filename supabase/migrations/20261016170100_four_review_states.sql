CREATE OR REPLACE FUNCTION public.integral_seller_approval_summary(p_seller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); seller uuid:=coalesce(p_seller_id,actor); result jsonb;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and is_active) then raise exception 'Acesso não autorizado.'; end if;
 if seller<>actor and not public.is_admin(actor) then raise exception 'Consulte somente seus pedidos.'; end if;
 with owned as (
 select o.*,case when approval_status='pending' then 'pending'
 when approval_status='rejected' and review_outcome='changes_requested' then 'changes_requested'
 when approval_status='rejected' then 'rejected'
 when approval_status is null and origin='catalogo' and kind='pre_pedido' and status='pre_pedido' and stock_state='nenhum' then 'pending'
 else 'approved' end as review_stage
 from public.orders o where seller_id=seller and deleted_at is null and superseded_at is null and status<>'cancelado'),
 receipts as (
 select p.id,p.order_id,o.number,o.revision_no,p.amount,p.currency,p.created_at,p.review_note,
 case when p.status='pago' then 'approved' when p.status='pendente' then 'pending' when p.review_decision='changes_requested' then 'changes_requested' else 'rejected' end as review_stage
 from public.payments p join owned o on o.id=p.order_id
 where p.status in ('pago','pendente') or p.review_decision in ('rejected','changes_requested')),
 balances as (
 select currency,sum(greatest(total-coalesce(amount_paid,0),0)) amount from owned
 where review_stage='approved' and workflow_stage is distinct from 'perdido'
 group by currency having sum(greatest(total-coalesce(amount_paid,0),0))>0)
 select jsonb_build_object(
 'orders',jsonb_build_object('pending',(select count(*) from owned where review_stage='pending'),
 'approved',(select count(*) from owned where review_stage='approved'),
 'changes_requested',(select count(*) from owned where review_stage='changes_requested'),
 'rejected',(select count(*) from owned where review_stage='rejected')),
 'payments',jsonb_build_object('pending',(select count(*) from receipts where review_stage='pending'),
 'approved',(select count(*) from receipts where review_stage='approved'),
 'rejected',(select count(*) from receipts where review_stage='rejected'),
 'changes_requested',(select count(*) from receipts where review_stage='changes_requested')),
 'recent_payments',coalesce((select jsonb_agg(r) from(select * from receipts order by created_at desc,id limit 5)r),'[]'::jsonb),
 'balances',coalesce((select jsonb_agg(balances) from balances),'[]'::jsonb)) into result;
 return result;
end; $function$;
CREATE OR REPLACE FUNCTION public.integral_approval_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); financial_allowed boolean; result jsonb;
begin
 if actor is null or not private.integral_can_view_order_approvals(actor) then raise exception 'Resumo restrito à área de aprovações.' using errcode='42501'; end if;
 financial_allowed:=private.integral_can_view_financial_approvals(actor);
 with active as (
 select o.id,case when approval_status='pending' then 'pending'
 when approval_status='rejected' and review_outcome='changes_requested' then 'changes_requested'
 when approval_status='rejected' then 'rejected'
 when approval_status is null and origin='catalogo' and kind='pre_pedido' and status='pre_pedido' and stock_state='nenhum' then 'pending'
 else 'approved' end as review_stage
 from public.orders o where deleted_at is null and superseded_at is null and status<>'cancelado'),
 receipts as (
 select p.status,p.review_decision,p.id from public.payments p join active a on a.id=p.order_id where financial_allowed)
 select jsonb_build_object(
 'orders',jsonb_build_object(
 'pending',(select count(*) from active where review_stage='pending'),
 'approved',(select count(*) from active where review_stage='approved'),
 'changes_requested',(select count(*) from active where review_stage='changes_requested'),
 'rejected',(select count(*) from active where review_stage='rejected')),
 'payments',case when financial_allowed then jsonb_build_object(
 'pending',(select count(*) from receipts p where status='pendente' and exists(select 1 from private.seller_pending_receipts r where r.payment_id=p.id and r.confirmed_at is null)),
 'approved',(select count(*) from receipts where status='pago'),
 'rejected',(select count(*) from receipts where status<>'pago' and review_decision='rejected'),
 'changes_requested',(select count(*) from receipts where status<>'pago' and review_decision='changes_requested')) else null end)
 into result;
 return result;
end; $function$
;
