create or replace function public.integral_sales_catalog(p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); member uuid:=coalesce(p_user_id,actor); result jsonb;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and is_active) then raise exception 'Conta não autorizada.' using errcode='42501'; end if;
 if member<>actor and not public.is_admin(actor) then raise exception 'Prévia restrita à administração.' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=member and is_active) then raise exception 'Membro inativo.' using errcode='42501'; end if;
 with allowed as (
 select i.id,i.product_id,i.category_id,i.name,i.sku,i.barcode,i.brand,i.unit,i.image_url,i.is_active,
 i.price,coalesce(i.price_currency,i.currency) as price_currency,i.currency,
 greatest(0,i.quantity-i.reserved) as quantity,i.variation,i.size,i.weight,i.volume,
 i.public_description,i.intended_use,i.usage_instructions,i.information_source_url
 from public.inventory_items i join public.products p on p.id=i.product_id
 where i.is_active and p.is_active and p.deleted_at is null and (public.is_admin(member) or private.seller_item_allowed(member,i.id)))
 select jsonb_build_object(
 'items',coalesce((select jsonb_agg(a order by a.name) from allowed a),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(p order by p.name) from(select id,name,image_url from public.products where id in(select product_id from allowed))p),'[]'::jsonb),
 'catalogs',coalesce((select jsonb_agg(c order by c.title) from(
 select id,title,slug,layout,is_published,created_by from public.digital_catalogs
 where created_by=member or (is_published and (visible_to_all_members or member=any(visible_member_ids)))
 )c),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(c order by c.name) from(select id,product_id,name,image_url from public.product_categories where id in(select category_id from allowed))c),'[]'::jsonb)) into result;
 return result;
end; $$;
revoke all on function public.integral_sales_catalog(uuid) from public,anon;
grant execute on function public.integral_sales_catalog(uuid) to authenticated;
