-- One-time reconciliation of existing ACTIVE seller accounts.
-- Do not reactivate test accounts or change any territory/owner scope.
WITH active_sellers AS (
  SELECT DISTINCT p.id
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id=p.id AND r.role='vendedor'
  WHERE p.is_active
),
active_products AS (
  SELECT id FROM public.products WHERE is_active AND deleted_at IS NULL
),
active_subcategories AS (
  SELECT c.id
  FROM public.product_categories c
  JOIN active_products p ON p.id=c.product_id
),
active_items AS (
  SELECT i.id
  FROM public.inventory_items i
  JOIN active_products p ON p.id=i.product_id
  WHERE i.is_active
),
products_granted AS (
  INSERT INTO public.product_users(user_id,product_id,role_in_product)
  SELECT s.id,p.id,'vendedor'
  FROM active_sellers s CROSS JOIN active_products p
  ON CONFLICT (product_id,user_id) DO NOTHING
  RETURNING 1
),
subcategories_granted AS (
  INSERT INTO public.product_category_users(user_id,category_id)
  SELECT s.id,c.id
  FROM active_sellers s CROSS JOIN active_subcategories c
  ON CONFLICT (user_id,category_id) DO NOTHING
  RETURNING 1
),
items_granted AS (
  INSERT INTO public.inventory_item_users(user_id,item_id)
  SELECT s.id,i.id
  FROM active_sellers s CROSS JOIN active_items i
  ON CONFLICT (user_id,item_id) DO NOTHING
  RETURNING 1
),
kaliu_write AS (
  UPDATE public.integral_division_access a
  SET can_view=true,can_write=true,updated_at=now()
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id=p.id AND r.role='vendedor'
  WHERE a.user_id=p.id AND p.is_active
    AND lower(btrim(p.full_name))='kaliu'
    AND a.system_code='vendas_estaduais'
  RETURNING a.id
)
SELECT
  (SELECT count(*) FROM active_sellers) active_sellers,
  (SELECT count(*) FROM active_products) active_categories,
  (SELECT count(*) FROM active_subcategories) subcategories,
  (SELECT count(*) FROM active_items) items,
  (SELECT count(*) FROM products_granted) new_category_grants,
  (SELECT count(*) FROM subcategories_granted) new_subcategory_grants,
  (SELECT count(*) FROM items_granted) new_item_grants,
  (SELECT count(*) FROM kaliu_write) kaliu_grants_updated;
