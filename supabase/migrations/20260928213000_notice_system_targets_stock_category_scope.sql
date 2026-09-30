alter table public.internal_notices add column if not exists target_systems text[] not null default '{}';
alter table public.internal_notices drop constraint if exists internal_notices_target_systems_valid;
alter table public.internal_notices add constraint internal_notices_target_systems_valid check (target_systems <@ array['direcao_geral','captacao','vendas_estaduais','lideranca_regional','distribuidores_municipais','estoques','fornecedores','transportes']::text[]);
drop policy if exists internal_notices_public_login on public.internal_notices;
create policy internal_notices_public_login on public.internal_notices for select to anon using (show_on_login and not archived and publish_at <= now() and (expires_at is null or expires_at > now()) and (cardinality(target_systems)=0 or 'direcao_geral'=any(target_systems)));
drop policy if exists stock_category_inventory_read on public.inventory_items;
create policy stock_category_inventory_read on public.inventory_items as restrictive for select to authenticated using (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or exists(select 1 from public.product_users pu where pu.user_id=(select auth.uid()) and pu.product_id=inventory_items.product_id));
drop policy if exists stock_category_inventory_insert on public.inventory_items;
create policy stock_category_inventory_insert on public.inventory_items as restrictive for insert to authenticated with check (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or exists(select 1 from public.product_users pu where pu.user_id=(select auth.uid()) and pu.product_id=inventory_items.product_id));
drop policy if exists stock_category_inventory_update on public.inventory_items;
create policy stock_category_inventory_update on public.inventory_items as restrictive for update to authenticated using (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or exists(select 1 from public.product_users pu where pu.user_id=(select auth.uid()) and pu.product_id=inventory_items.product_id)) with check (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or exists(select 1 from public.product_users pu where pu.user_id=(select auth.uid()) and pu.product_id=inventory_items.product_id));
drop policy if exists stock_owner_warehouse_read on public.warehouses;
create policy stock_owner_warehouse_read on public.warehouses as restrictive for select to authenticated using (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or public.stock_user_warehouse_scope((select auth.uid()), id));
drop policy if exists stock_owner_warehouse_insert on public.warehouses;
create policy stock_owner_warehouse_insert on public.warehouses as restrictive for insert to authenticated with check (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or (created_by=(select auth.uid()) and exists(select 1 from public.product_users pu where pu.user_id=(select auth.uid()))));
drop policy if exists stock_owner_warehouse_update on public.warehouses;
create policy stock_owner_warehouse_update on public.warehouses as restrictive for update to authenticated using (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or public.stock_user_warehouse_scope((select auth.uid()),id)) with check (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or public.stock_user_warehouse_scope((select auth.uid()),id));
drop policy if exists stock_owner_inventory_read on public.warehouse_inventory;
create policy stock_owner_inventory_read on public.warehouse_inventory as restrictive for select to authenticated using (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or (public.stock_user_warehouse_scope((select auth.uid()),warehouse_id) and exists(select 1 from public.inventory_items i join public.product_users pu on pu.product_id=i.product_id and pu.user_id=(select auth.uid()) where i.id=warehouse_inventory.item_id)));
drop policy if exists stock_owner_inventory_insert on public.warehouse_inventory;
create policy stock_owner_inventory_insert on public.warehouse_inventory as restrictive for insert to authenticated with check (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or (public.stock_user_warehouse_scope((select auth.uid()),warehouse_id) and exists(select 1 from public.inventory_items i join public.product_users pu on pu.product_id=i.product_id and pu.user_id=(select auth.uid()) where i.id=warehouse_inventory.item_id)));
drop policy if exists stock_owner_inventory_update on public.warehouse_inventory;
create policy stock_owner_inventory_update on public.warehouse_inventory as restrictive for update to authenticated using (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or (public.stock_user_warehouse_scope((select auth.uid()),warehouse_id) and exists(select 1 from public.inventory_items i join public.product_users pu on pu.product_id=i.product_id and pu.user_id=(select auth.uid()) where i.id=warehouse_inventory.item_id))) with check (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or (public.stock_user_warehouse_scope((select auth.uid()),warehouse_id) and exists(select 1 from public.inventory_items i join public.product_users pu on pu.product_id=i.product_id and pu.user_id=(select auth.uid()) where i.id=warehouse_inventory.item_id)));
create or replace function public.inv_can_write_product(_uid uuid, _product_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select _uid is not null and (public.is_admin(_uid) or (
    exists(select 1 from public.user_roles ur where ur.user_id=_uid and ur.role='estoque')
    and exists(select 1 from public.product_users pu where pu.user_id=_uid and pu.product_id=_product_id)
  ))
$$;
create or replace function public.inv_in_scope(_uid uuid, _item_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select _uid is not null and (public.is_admin(_uid) or exists(
    select 1 from public.inventory_items i
    join public.product_users pu on pu.product_id=i.product_id and pu.user_id=_uid
    where i.id=_item_id
  ))
$$;
create or replace function public.inv_can_manage_item(_uid uuid, _item_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select _uid is not null and (public.is_admin(_uid) or (
    exists(select 1 from public.user_roles ur where ur.user_id=_uid and ur.role='estoque')
    and public.inv_in_scope(_uid,_item_id)
  ))
$$;
drop policy if exists stock_owner_item_location_read on public.inventory_item_locations;
create policy stock_owner_item_location_read on public.inventory_item_locations as restrictive for select to authenticated using (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or public.stock_user_warehouse_scope((select auth.uid()),warehouse_id));
drop policy if exists stock_owner_item_location_insert on public.inventory_item_locations;
create policy stock_owner_item_location_insert on public.inventory_item_locations as restrictive for insert to authenticated with check (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or (public.stock_user_warehouse_scope((select auth.uid()),warehouse_id) and public.inv_can_manage_item((select auth.uid()),item_id)));
drop policy if exists stock_owner_item_location_update on public.inventory_item_locations;
create policy stock_owner_item_location_update on public.inventory_item_locations as restrictive for update to authenticated using (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or public.stock_user_warehouse_scope((select auth.uid()),warehouse_id)) with check (public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or (public.stock_user_warehouse_scope((select auth.uid()),warehouse_id) and public.inv_can_manage_item((select auth.uid()),item_id)));

drop policy if exists notices_admin_only_insert on public.internal_notices;
create policy notices_admin_only_insert on public.internal_notices as restrictive for insert to authenticated with check (public.is_admin((select auth.uid())));
drop policy if exists notices_admin_only_update on public.internal_notices;
create policy notices_admin_only_update on public.internal_notices as restrictive for update to authenticated using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
drop policy if exists notices_admin_only_delete on public.internal_notices;
create policy notices_admin_only_delete on public.internal_notices as restrictive for delete to authenticated using (public.is_admin((select auth.uid())));
drop policy if exists product_users_admin_only_insert on public.product_users;
create policy product_users_admin_only_insert on public.product_users as restrictive for insert to authenticated with check (public.is_admin((select auth.uid())));
drop policy if exists product_users_admin_only_update on public.product_users;
create policy product_users_admin_only_update on public.product_users as restrictive for update to authenticated using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
drop policy if exists product_users_admin_only_delete on public.product_users;
create policy product_users_admin_only_delete on public.product_users as restrictive for delete to authenticated using (public.is_admin((select auth.uid())));
drop policy if exists stock_category_inventory_delete on public.inventory_items;
create policy stock_category_inventory_delete on public.inventory_items as restrictive for delete to authenticated using (
 public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or
 exists(select 1 from public.product_users pu where pu.user_id=(select auth.uid()) and pu.product_id=inventory_items.product_id)
);
drop policy if exists stock_owner_warehouse_delete on public.warehouses;
create policy stock_owner_warehouse_delete on public.warehouses as restrictive for delete to authenticated using (
 public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or public.stock_user_warehouse_scope((select auth.uid()),id)
);
drop policy if exists stock_owner_inventory_delete on public.warehouse_inventory;
create policy stock_owner_inventory_delete on public.warehouse_inventory as restrictive for delete to authenticated using (
 public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or
 (public.stock_user_warehouse_scope((select auth.uid()),warehouse_id) and exists(select 1 from public.inventory_items i join public.product_users pu on pu.product_id=i.product_id and pu.user_id=(select auth.uid()) where i.id=warehouse_inventory.item_id))
);
drop policy if exists stock_owner_item_location_delete on public.inventory_item_locations;
create policy stock_owner_item_location_delete on public.inventory_item_locations as restrictive for delete to authenticated using (
 public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or
 (public.stock_user_warehouse_scope((select auth.uid()),warehouse_id) and public.inv_can_manage_item((select auth.uid()),item_id))
);
drop policy if exists stock_category_subcategory_read on public.product_categories;
create policy stock_category_subcategory_read on public.product_categories as restrictive for select to authenticated using (
 public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or
 exists(select 1 from public.product_users pu where pu.user_id=(select auth.uid()) and pu.product_id=product_categories.product_id)
);
drop policy if exists stock_category_subcategory_insert on public.product_categories;
create policy stock_category_subcategory_insert on public.product_categories as restrictive for insert to authenticated with check (
 public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or
 exists(select 1 from public.product_users pu where pu.user_id=(select auth.uid()) and pu.product_id=product_categories.product_id)
);
drop policy if exists stock_category_subcategory_update on public.product_categories;
create policy stock_category_subcategory_update on public.product_categories as restrictive for update to authenticated using (
 public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or
 exists(select 1 from public.product_users pu where pu.user_id=(select auth.uid()) and pu.product_id=product_categories.product_id)
) with check (
 public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or
 exists(select 1 from public.product_users pu where pu.user_id=(select auth.uid()) and pu.product_id=product_categories.product_id)
);
drop policy if exists stock_category_subcategory_delete on public.product_categories;
create policy stock_category_subcategory_delete on public.product_categories as restrictive for delete to authenticated using (
 public.is_admin((select auth.uid())) or not exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='estoque') or
 exists(select 1 from public.product_users pu where pu.user_id=(select auth.uid()) and pu.product_id=product_categories.product_id)
);