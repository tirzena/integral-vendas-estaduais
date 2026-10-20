BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT p.id::text FROM public.profiles p WHERE private.seller_is_restricted(p.id) AND EXISTS(SELECT 1 FROM private.effective_capabilities(p.id) c WHERE c='company_sales') LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE portal jsonb; count_items integer; count_warehouses integer; oid uuid; ctx jsonb;
BEGIN
 portal:=public.seller_portal_data();
 SELECT count(*) INTO count_items FROM public.sales_items_for_sale();
 SELECT count(*) INTO count_warehouses FROM public.sales_warehouses();
 IF count_items<>jsonb_array_length(portal->'items') OR count_warehouses<>jsonb_array_length(portal->'warehouses') THEN RAISE EXCEPTION 'Scope mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM public.sales_items_for_sale() i WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(portal->'items') j WHERE j->>'id'=i.id::text)) THEN RAISE EXCEPTION 'Unauthorized item'; END IF;
 SELECT (j->>'id')::uuid INTO oid FROM jsonb_array_elements(portal->'orders') j LIMIT 1;
 IF oid IS NOT NULL THEN ctx:=public.division_order_context(oid); END IF;
 PERFORM id,name FROM public.customers WHERE deleted_at IS NULL;
END $test$;
SELECT 'authenticated_legacy_editor_queries_passed' AS result;
ROLLBACK;
