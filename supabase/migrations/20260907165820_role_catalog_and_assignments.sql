-- Áreas, cargos, níveis e permissões configuráveis.
-- user_roles continua reservado às funções estruturais do sistema.
CREATE TABLE IF NOT EXISTS public.organization_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  system_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.job_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rank integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  system_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.job_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.organization_areas(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  system_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area_id, name)
);

CREATE TABLE IF NOT EXISTS public.permission_catalog (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  group_name text NOT NULL DEFAULT 'Geral',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.job_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_role_id uuid NOT NULL REFERENCES public.job_roles(id) ON DELETE CASCADE,
  job_level_id uuid REFERENCES public.job_levels(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permission_catalog(key) ON DELETE CASCADE,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_role_permissions_default_uq
  ON public.job_role_permissions(job_role_id, permission_key) WHERE job_level_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS job_role_permissions_level_uq
  ON public.job_role_permissions(job_role_id, job_level_id, permission_key) WHERE job_level_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.member_job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_role_id uuid NOT NULL REFERENCES public.job_roles(id) ON DELETE RESTRICT,
  job_level_id uuid REFERENCES public.job_levels(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (user_id, job_role_id)
);
CREATE INDEX IF NOT EXISTS member_job_assignments_user_idx ON public.member_job_assignments(user_id);

GRANT SELECT ON public.organization_areas, public.job_levels, public.job_roles,
  public.permission_catalog, public.job_role_permissions, public.member_job_assignments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.organization_areas, public.job_levels, public.job_roles,
  public.job_role_permissions, public.member_job_assignments TO authenticated;
GRANT ALL ON public.organization_areas, public.job_levels, public.job_roles,
  public.permission_catalog, public.job_role_permissions, public.member_job_assignments TO service_role;

ALTER TABLE public.organization_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_job_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_areas_read ON public.organization_areas;
CREATE POLICY organization_areas_read ON public.organization_areas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS job_levels_read ON public.job_levels;
CREATE POLICY job_levels_read ON public.job_levels FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS job_roles_read ON public.job_roles;
CREATE POLICY job_roles_read ON public.job_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS permission_catalog_read ON public.permission_catalog;
CREATE POLICY permission_catalog_read ON public.permission_catalog FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS job_role_permissions_read ON public.job_role_permissions;
CREATE POLICY job_role_permissions_read ON public.job_role_permissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS member_job_assignments_read ON public.member_job_assignments;
CREATE POLICY member_job_assignments_read ON public.member_job_assignments FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.is_admin((select auth.uid())) OR public.has_role((select auth.uid()), 'gestor'));

DROP POLICY IF EXISTS organization_areas_admin ON public.organization_areas;
CREATE POLICY organization_areas_admin ON public.organization_areas FOR ALL TO authenticated
  USING (public.is_admin((select auth.uid()))) WITH CHECK (public.is_admin((select auth.uid())));
DROP POLICY IF EXISTS job_levels_admin ON public.job_levels;
CREATE POLICY job_levels_admin ON public.job_levels FOR ALL TO authenticated
  USING (public.is_admin((select auth.uid()))) WITH CHECK (public.is_admin((select auth.uid())));
DROP POLICY IF EXISTS job_roles_admin ON public.job_roles;
CREATE POLICY job_roles_admin ON public.job_roles FOR ALL TO authenticated
  USING (public.is_admin((select auth.uid()))) WITH CHECK (public.is_admin((select auth.uid())));
DROP POLICY IF EXISTS job_role_permissions_admin ON public.job_role_permissions;
CREATE POLICY job_role_permissions_admin ON public.job_role_permissions FOR ALL TO authenticated
  USING (public.is_admin((select auth.uid()))) WITH CHECK (public.is_admin((select auth.uid())));
DROP POLICY IF EXISTS member_job_assignments_admin ON public.member_job_assignments;
CREATE POLICY member_job_assignments_admin ON public.member_job_assignments FOR ALL TO authenticated
  USING (public.is_admin((select auth.uid()))) WITH CHECK (public.is_admin((select auth.uid())));

DROP TRIGGER IF EXISTS trg_organization_areas_updated ON public.organization_areas;
CREATE TRIGGER trg_organization_areas_updated BEFORE UPDATE ON public.organization_areas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_job_levels_updated ON public.job_levels;
CREATE TRIGGER trg_job_levels_updated BEFORE UPDATE ON public.job_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_job_roles_updated ON public.job_roles;
CREATE TRIGGER trg_job_roles_updated BEFORE UPDATE ON public.job_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_job_role_permissions_updated ON public.job_role_permissions;
CREATE TRIGGER trg_job_role_permissions_updated BEFORE UPDATE ON public.job_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.permission_catalog(key,label,description,group_name,sort_order) VALUES
('company_finance','Finanças da empresa','Ver números financeiros de toda a empresa.','Financeiro',10),
('company_sales','Vendas da empresa','Ver vendas e resultados de toda a equipe.','Vendas',20),
('manage_team','Gerenciar equipe','Cadastrar pessoas, equipes, cargos e permissões.','Pessoas',30),
('manage_suppliers','Gerenciar fornecedores','Ver e alterar fornecedores.','Operações',40),
('marketing','Marketing e tráfego','Acessar campanhas e integrações de marketing.','Marketing',50),
('admin_area','Área administrativa','Acessar configurações e dados administrativos.','Administração',60),
('inventory_view','Ver estoque','Consultar produtos e estoque.','Estoque',70),
('inventory_manage','Gerenciar estoque','Alterar produtos, quantidades e movimentações.','Estoque',80),
('deliveries_view','Ver entregas','Consultar pedidos e entregas.','Operações',90),
('deliveries_manage','Gerenciar entregas','Alterar entregas e responsáveis.','Operações',100),
('tracking_share_own','Compartilhar localização própria','Compartilhar a própria localização em uma entrega.','Operações',110),
('tracking_view_exact','Ver localização exata','Ver a localização exata de entregadores.','Operações',120),
('tracking_manage','Gerenciar rastreamento','Criar e encerrar sessões de rastreamento.','Operações',130)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, description=EXCLUDED.description,
  group_name=EXCLUDED.group_name, sort_order=EXCLUDED.sort_order;

INSERT INTO public.organization_areas(name,system_key) VALUES
('Diretoria','diretoria'),('Marketing','marketing'),('Financeiro','financeiro'),('RH','rh'),
('Vendas','vendas'),('Tecnologia','tecnologia'),('Criação','criacao'),('Operações','operacoes'),
('Estoque','estoque'),('Fornecedores','fornecedores'),('Entregas','entregas'),('Gerência','gerencia')
ON CONFLICT DO NOTHING;

INSERT INTO public.job_levels(name,rank,system_key) VALUES
('Júnior',10,'junior'),('Pleno',20,'pleno'),('Sênior',30,'senior'),('Liderança',40,'lideranca')
ON CONFLICT DO NOTHING;

INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Fundador','fundador' FROM public.organization_areas WHERE system_key='diretoria' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Diretor geral','diretor_geral' FROM public.organization_areas WHERE system_key='diretoria' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Diretor executivo','diretor_executivo' FROM public.organization_areas WHERE system_key='diretoria' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Diretor de marketing','diretor_marketing' FROM public.organization_areas WHERE system_key='marketing' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Diretor financeiro','diretor_financeiro' FROM public.organization_areas WHERE system_key='financeiro' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Diretor de RH','diretor_rh' FROM public.organization_areas WHERE system_key='rh' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Diretor de vendas','diretor_vendas' FROM public.organization_areas WHERE system_key='vendas' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Gestor executivo','gestor_executivo' FROM public.organization_areas WHERE system_key='diretoria' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Gerente','gerente' FROM public.organization_areas WHERE system_key='gerencia' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Assistente','assistente' FROM public.organization_areas WHERE system_key='operacoes' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Vendedor','vendedor' FROM public.organization_areas WHERE system_key='vendas' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Designer','designer' FROM public.organization_areas WHERE system_key='criacao' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Gestor de tráfego','gestor_trafego' FROM public.organization_areas WHERE system_key='marketing' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Editor','editor' FROM public.organization_areas WHERE system_key='criacao' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Filmmaker','filmmaker' FROM public.organization_areas WHERE system_key='criacao' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Social media','social_media' FROM public.organization_areas WHERE system_key='marketing' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Desenvolvedor','desenvolvedor' FROM public.organization_areas WHERE system_key='tecnologia' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Analista financeiro','analista_financeiro' FROM public.organization_areas WHERE system_key='financeiro' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Profissional de RH','profissional_rh' FROM public.organization_areas WHERE system_key='rh' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Estoquista','estoquista' FROM public.organization_areas WHERE system_key='estoque' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Comprador','comprador' FROM public.organization_areas WHERE system_key='fornecedores' ON CONFLICT DO NOTHING;
INSERT INTO public.job_roles(area_id,name,system_key) SELECT id,'Entregador','entregador' FROM public.organization_areas WHERE system_key='entregas' ON CONFLICT DO NOTHING;

-- Permissões padrão. Ausência significa acesso negado.
INSERT INTO public.job_role_permissions(job_role_id,permission_key,allowed)
SELECT r.id,p.key,true FROM public.job_roles r CROSS JOIN public.permission_catalog p
WHERE r.system_key IN ('fundador','diretor_geral')
ON CONFLICT DO NOTHING;
INSERT INTO public.job_role_permissions(job_role_id,permission_key,allowed)
SELECT r.id,p.key,true FROM public.job_roles r JOIN public.permission_catalog p ON p.key = ANY(
  CASE r.system_key
    WHEN 'diretor_executivo' THEN ARRAY['company_finance','company_sales','manage_team','manage_suppliers','marketing','inventory_view','deliveries_view','deliveries_manage','tracking_view_exact']
    WHEN 'gestor_executivo' THEN ARRAY['company_sales','manage_team','manage_suppliers','marketing','inventory_view','deliveries_view','deliveries_manage']
    WHEN 'gerente' THEN ARRAY['company_sales','manage_team','manage_suppliers','inventory_view','deliveries_view','deliveries_manage']
    WHEN 'diretor_marketing' THEN ARRAY['company_sales','manage_team','marketing']
    WHEN 'diretor_financeiro' THEN ARRAY['company_finance','company_sales','manage_team','manage_suppliers','inventory_view']
    WHEN 'diretor_rh' THEN ARRAY['manage_team']
    WHEN 'diretor_vendas' THEN ARRAY['company_sales','manage_team','deliveries_view']
    WHEN 'gestor_trafego' THEN ARRAY['marketing']
    WHEN 'social_media' THEN ARRAY['marketing']
    WHEN 'analista_financeiro' THEN ARRAY['company_finance','company_sales']
    WHEN 'estoquista' THEN ARRAY['manage_suppliers','inventory_view','inventory_manage']
    WHEN 'comprador' THEN ARRAY['manage_suppliers','inventory_view']
    WHEN 'entregador' THEN ARRAY['deliveries_view','tracking_share_own']
    ELSE ARRAY[]::text[] END
) WHERE r.system_key NOT IN ('fundador','diretor_geral')
ON CONFLICT DO NOTHING;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.effective_capabilities(_uid uuid)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.key
  FROM public.permission_catalog p
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=_uid AND ur.role IN ('superadmin','admin')
  )
  OR (
    EXISTS (SELECT 1 FROM public.member_job_assignments a WHERE a.user_id=_uid)
    AND NOT EXISTS (
      SELECT 1
      FROM public.member_job_assignments a
      WHERE a.user_id=_uid
        AND NOT COALESCE(
          (SELECT rp.allowed FROM public.job_role_permissions rp
           WHERE rp.job_role_id=a.job_role_id AND rp.job_level_id=a.job_level_id AND rp.permission_key=p.key LIMIT 1),
          (SELECT rp.allowed FROM public.job_role_permissions rp
           WHERE rp.job_role_id=a.job_role_id AND rp.job_level_id IS NULL AND rp.permission_key=p.key LIMIT 1),
          false
        )
    )
  )
  OR (
    NOT EXISTS (SELECT 1 FROM public.member_job_assignments a WHERE a.user_id=_uid)
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_uid AND (
        (p.key='company_finance' AND ur.role IN ('financeiro')) OR
        (p.key='company_sales' AND ur.role IN ('gestor','financeiro')) OR
        (p.key='manage_team' AND ur.role='gestor') OR
        (p.key='manage_suppliers' AND ur.role IN ('gestor','financeiro','estoque')) OR
        (p.key='marketing' AND ur.role='gestor') OR
        (p.key='inventory_view' AND ur.role IN ('gestor','financeiro','estoque')) OR
        (p.key='inventory_manage' AND ur.role='estoque') OR
        (p.key='deliveries_view' AND ur.role IN ('gestor','entregador')) OR
        (p.key='deliveries_manage' AND ur.role='gestor') OR
        (p.key='tracking_share_own' AND ur.role='entregador')
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION private.effective_capabilities(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.effective_capabilities(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_capabilities()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM private.effective_capabilities((select auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.get_my_capabilities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_capabilities() TO authenticated;

CREATE OR REPLACE FUNCTION public.app_has_cap(_uid uuid, _cap text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT (_uid = (select auth.uid()) OR current_user = 'service_role') AND EXISTS(
    SELECT 1 FROM private.effective_capabilities(_uid) c WHERE c=_cap
  )
$$;
REVOKE ALL ON FUNCTION public.app_has_cap(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_has_cap(uuid,text) TO authenticated, service_role;

-- O superadministrador é uma função estrutural e não pode ser removido pelo catálogo de cargos.
CREATE OR REPLACE FUNCTION public.protect_last_superadmin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.role='superadmin' AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role='superadmin' AND id<>OLD.id
  ) THEN RAISE EXCEPTION 'Não é possível remover o único superadministrador.';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_last_superadmin() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_protect_last_superadmin ON public.user_roles;
CREATE TRIGGER trg_protect_last_superadmin BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_superadmin();

