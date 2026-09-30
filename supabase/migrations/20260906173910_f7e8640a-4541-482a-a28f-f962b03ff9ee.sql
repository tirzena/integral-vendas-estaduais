REVOKE EXECUTE ON FUNCTION public.can_manage_catalog(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_product_access(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_manage_catalog(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_product_access(uuid, uuid) TO authenticated, service_role;