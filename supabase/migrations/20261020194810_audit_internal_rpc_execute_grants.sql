DO $audit$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid,p.prorettype,p.oid::regprocedure AS signature FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef AND
 (p.prorettype='trigger'::regtype OR p.proname IN
 ('can_use_company_access','delete_company_access','save_company_access','reveal_company_access_secret',
 'purchase_create','purchase_register_payment','purchase_management_options','purchases_for_management',
 'purchase_sync_from_sales_order','update_product_authenticity_theme'))
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
  IF f.prorettype='trigger'::regtype THEN
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated',f.signature);
  ELSE
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
  END IF;
 END LOOP;
END $audit$;
