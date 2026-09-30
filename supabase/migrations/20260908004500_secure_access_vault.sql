-- Cofre interno de acessos. Senhas ficam cifradas e só podem ser reveladas por RPC auditada.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.access_vault_keys (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  encryption_key text NOT NULL
);
ALTER TABLE private.access_vault_keys ENABLE ROW LEVEL SECURITY;

INSERT INTO private.access_vault_keys(singleton, encryption_key)
VALUES (true, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.company_access_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'Outro',
  username text,
  secret_cipher bytea,
  page_url text,
  notes text,
  visibility_scope text NOT NULL DEFAULT 'privado'
    CHECK (visibility_scope IN ('privado','equipe','geral')),
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  viewers_can_reveal boolean NOT NULL DEFAULT false,
  viewers_can_edit boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (visibility_scope <> 'equipe' OR team_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.company_access_vault_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_id uuid NOT NULL REFERENCES public.company_access_vault(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_reveal boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(access_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.company_access_vault_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  access_id uuid REFERENCES public.company_access_vault(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('criou','visualizou','revelou','editou','excluiu')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_access_vault_team_idx ON public.company_access_vault(team_id);
CREATE INDEX IF NOT EXISTS company_access_vault_grants_user_idx ON public.company_access_vault_grants(user_id);

CREATE OR REPLACE FUNCTION public.can_use_company_access(p_access_id uuid, p_action text DEFAULT 'view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
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

ALTER TABLE public.company_access_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_access_vault_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_access_vault_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_access_vault_read ON public.company_access_vault;
CREATE POLICY company_access_vault_read ON public.company_access_vault FOR SELECT TO authenticated
USING (public.can_use_company_access(id, 'view'));

DROP POLICY IF EXISTS company_access_vault_grants_read ON public.company_access_vault_grants;
CREATE POLICY company_access_vault_grants_read ON public.company_access_vault_grants FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.can_use_company_access(access_id, 'edit'));

DROP POLICY IF EXISTS company_access_vault_audit_read ON public.company_access_vault_audit;
CREATE POLICY company_access_vault_audit_read ON public.company_access_vault_audit FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.can_use_company_access(access_id, 'edit'));

CREATE OR REPLACE FUNCTION public.save_company_access(
  p_id uuid, p_title text, p_category text, p_username text, p_secret text,
  p_page_url text, p_notes text, p_visibility_scope text, p_team_id uuid,
  p_viewers_can_reveal boolean, p_viewers_can_edit boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,private,extensions AS $$
DECLARE v_id uuid; v_key text;
BEGIN
  IF trim(coalesce(p_title,''))='' THEN RAISE EXCEPTION 'Informe o nome do acesso'; END IF;
  IF p_visibility_scope NOT IN ('privado','equipe','geral') THEN RAISE EXCEPTION 'Visibilidade inválida'; END IF;
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
    IF NOT public.can_use_company_access(p_id,'edit') THEN RAISE EXCEPTION 'Sem permissão para editar este acesso'; END IF;
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

CREATE OR REPLACE FUNCTION public.reveal_company_access_secret(p_access_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,extensions AS $$
DECLARE v_secret bytea; v_key text; v_value text;
BEGIN
  IF NOT public.can_use_company_access(p_access_id,'reveal') THEN RAISE EXCEPTION 'Sem permissão para revelar esta senha'; END IF;
  SELECT secret_cipher INTO v_secret FROM public.company_access_vault WHERE id=p_access_id;
  SELECT encryption_key INTO v_key FROM private.access_vault_keys WHERE singleton;
  v_value:=CASE WHEN v_secret IS NULL THEN '' ELSE extensions.pgp_sym_decrypt(v_secret,v_key) END;
  INSERT INTO public.company_access_vault_audit(access_id,user_id,action) VALUES(p_access_id,auth.uid(),'revelou');
  RETURN v_value;
END $$;

CREATE OR REPLACE FUNCTION public.delete_company_access(p_access_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.can_use_company_access(p_access_id,'edit') THEN RAISE EXCEPTION 'Sem permissão para excluir este acesso'; END IF;
  INSERT INTO public.company_access_vault_audit(access_id,user_id,action) VALUES(p_access_id,auth.uid(),'excluiu');
  DELETE FROM public.company_access_vault WHERE id=p_access_id;
END $$;

GRANT EXECUTE ON FUNCTION public.can_use_company_access(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_company_access(uuid,text,text,text,text,text,text,text,uuid,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_company_access_secret(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_company_access(uuid) TO authenticated;
REVOKE ALL ON TABLE private.access_vault_keys FROM public,anon,authenticated;
