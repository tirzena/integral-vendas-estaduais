-- Permissao especifica para o cofre de acessos.
INSERT INTO public.permission_catalog(key,label,description,group_name,sort_order)
VALUES (
  'manage_access_vault',
  'Cofre de acessos',
  'Abrir a area Acessos e administrar credenciais autorizadas.',
  'Sistema',
  140
)
ON CONFLICT (key) DO UPDATE SET
  label=EXCLUDED.label,
  description=EXCLUDED.description,
  group_name=EXCLUDED.group_name,
  sort_order=EXCLUDED.sort_order;

-- Somente os cargos de topo recebem a nova permissao por padrao.
INSERT INTO public.job_role_permissions(job_role_id,permission_key,allowed)
SELECT id,'manage_access_vault',true
FROM public.job_roles
WHERE system_key IN ('fundador','diretor_geral')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_use_company_access(p_access_id uuid, p_action text DEFAULT 'view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.app_has_cap(auth.uid(), 'manage_access_vault') AND EXISTS(
    SELECT 1 FROM public.company_access_vault a
    WHERE a.id=p_access_id AND (
      public.is_admin(auth.uid()) OR a.created_by=auth.uid()
      OR EXISTS(
        SELECT 1 FROM public.company_access_vault_grants g
        WHERE g.access_id=a.id AND g.user_id=auth.uid()
          AND (p_action='view' OR (p_action='reveal' AND g.can_reveal) OR (p_action='edit' AND g.can_edit))
      )
      OR (
        (a.visibility_scope='geral' OR (
          a.visibility_scope='equipe' AND (
            EXISTS(SELECT 1 FROM public.team_members tm WHERE tm.team_id=a.team_id AND tm.user_id=auth.uid())
            OR EXISTS(SELECT 1 FROM public.teams t WHERE t.id=a.team_id AND t.manager_id=auth.uid())
          )
        ))
        AND (p_action='view' OR (p_action='reveal' AND a.viewers_can_reveal) OR (p_action='edit' AND a.viewers_can_edit))
      )
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.save_company_access(
  p_id uuid, p_title text, p_category text, p_username text, p_secret text,
  p_page_url text, p_notes text, p_visibility_scope text, p_team_id uuid,
  p_viewers_can_reveal boolean, p_viewers_can_edit boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,private,extensions AS $$
DECLARE v_id uuid; v_key text;
BEGIN
  IF NOT public.app_has_cap(auth.uid(), 'manage_access_vault') THEN
    RAISE EXCEPTION 'Sem permissao para administrar o cofre de acessos';
  END IF;
  IF trim(coalesce(p_title,''))='' THEN RAISE EXCEPTION 'Informe o nome do acesso'; END IF;
  IF p_visibility_scope NOT IN ('privado','equipe','geral') THEN RAISE EXCEPTION 'Visibilidade invalida'; END IF;
  IF p_visibility_scope='equipe' AND p_team_id IS NULL THEN RAISE EXCEPTION 'Escolha uma equipe'; END IF;
  SELECT encryption_key INTO v_key FROM private.access_vault_keys WHERE singleton;

  IF p_id IS NULL THEN
    INSERT INTO public.company_access_vault(title,category,username,secret_cipher,page_url,notes,visibility_scope,team_id,viewers_can_reveal,viewers_can_edit,created_by,updated_by)
    VALUES(trim(p_title),coalesce(nullif(trim(p_category),''),'Outro'),nullif(trim(p_username),''),
      CASE WHEN coalesce(p_secret,'')='' THEN NULL ELSE extensions.pgp_sym_encrypt(p_secret,v_key,'cipher-algo=aes256') END,
      nullif(trim(p_page_url),''),nullif(trim(p_notes),''),p_visibility_scope,
      CASE WHEN p_visibility_scope='equipe' THEN p_team_id ELSE NULL END,
      coalesce(p_viewers_can_reveal,false),coalesce(p_viewers_can_edit,false),auth.uid(),auth.uid()) RETURNING id INTO v_id;
    INSERT INTO public.company_access_vault_audit(access_id,user_id,action) VALUES(v_id,auth.uid(),'criou');
  ELSE
    IF NOT public.can_use_company_access(p_id,'edit') THEN RAISE EXCEPTION 'Sem permissao para editar este acesso'; END IF;
    UPDATE public.company_access_vault SET title=trim(p_title),category=coalesce(nullif(trim(p_category),''),'Outro'),
      username=nullif(trim(p_username),''),
      secret_cipher=CASE WHEN coalesce(p_secret,'')='' THEN secret_cipher ELSE extensions.pgp_sym_encrypt(p_secret,v_key,'cipher-algo=aes256') END,
      page_url=nullif(trim(p_page_url),''),notes=nullif(trim(p_notes),''),visibility_scope=p_visibility_scope,
      team_id=CASE WHEN p_visibility_scope='equipe' THEN p_team_id ELSE NULL END,
      viewers_can_reveal=coalesce(p_viewers_can_reveal,false),viewers_can_edit=coalesce(p_viewers_can_edit,false),
      updated_by=auth.uid(),updated_at=now() WHERE id=p_id;
    v_id:=p_id;
    INSERT INTO public.company_access_vault_audit(access_id,user_id,action) VALUES(v_id,auth.uid(),'editou');
  END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.save_company_access(uuid,text,text,text,text,text,text,text,uuid,boolean,boolean) TO authenticated;

