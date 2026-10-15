-- Capability metadata only. Does not change data RLS, grants, or seller write guards.
INSERT INTO private.integral_policy_backups(label,payload)
SELECT 'before_role_capability_metadata_20261015',
 jsonb_build_object('function',pg_get_functiondef(p.oid),'acl',p.proacl::text)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='get_my_capabilities'
AND NOT EXISTS(SELECT 1 FROM private.integral_policy_backups WHERE label='before_role_capability_metadata_20261015');

CREATE OR REPLACE FUNCTION public.get_my_capabilities()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT key FROM public.permission_catalog pc
  WHERE auth.uid() IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active)
    AND (
      private.integral_operation_allowed(auth.uid(),pc.key)
      OR (
        pc.key IN ('inventory_view','deliveries_view')
        AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role='vendedor')
        AND NOT EXISTS(
          SELECT 1 FROM public.integral_member_rules m
          WHERE m.user_id=auth.uid() AND m.permission_overrides->>pc.key='false'
        )
      )
    )
  ORDER BY pc.sort_order,pc.key;
$$;
REVOKE ALL ON FUNCTION public.get_my_capabilities() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_capabilities() TO authenticated,service_role;