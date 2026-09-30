-- Planejamento e recomendacoes da hierarquia. Alteracao aditiva: nenhum cargo ou vinculo e reclassificado.
ALTER TABLE public.job_roles
  ADD COLUMN IF NOT EXISTS occupancy_status text,
  ADD COLUMN IF NOT EXISTS recommendation_status text NOT NULL DEFAULT 'nao_necessario',
  ADD COLUMN IF NOT EXISTS functional_reports_to_role_id uuid REFERENCES public.job_roles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS is_corporate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trigger_metric text,
  ADD COLUMN IF NOT EXISTS trigger_threshold numeric,
  ADD COLUMN IF NOT EXISTS trigger_manual_value numeric,
  ADD COLUMN IF NOT EXISTS trigger_exceeded_since date,
  ADD COLUMN IF NOT EXISTS recommendation_dismissed_until date,
  ADD COLUMN IF NOT EXISTS recommendation_dismissed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recommendation_generated_at timestamptz;

ALTER TABLE public.job_roles DROP CONSTRAINT IF EXISTS job_roles_occupancy_status_check;
ALTER TABLE public.job_roles ADD CONSTRAINT job_roles_occupancy_status_check CHECK (
  occupancy_status IS NULL OR occupancy_status IN (
    'ocupado','vago_aprovado','planejado','acumulado','terceirizado','inativo'
  )
);
ALTER TABLE public.job_roles DROP CONSTRAINT IF EXISTS job_roles_recommendation_status_check;
ALTER TABLE public.job_roles ADD CONSTRAINT job_roles_recommendation_status_check CHECK (
  recommendation_status IN (
    'nao_necessario','monitoramento','proximo_do_gatilho',
    'contratacao_recomendada','contratacao_critica'
  )
);
ALTER TABLE public.job_roles DROP CONSTRAINT IF EXISTS job_roles_trigger_metric_check;
ALTER TABLE public.job_roles ADD CONSTRAINT job_roles_trigger_metric_check CHECK (
  trigger_metric IS NULL OR trigger_metric IN (
    'membros_area','subordinados_diretos','cargos_area','equipes_area',
    'unidades','areas','volume_mensal','turnos','complexidade','manual'
  )
);
ALTER TABLE public.job_roles DROP CONSTRAINT IF EXISTS job_roles_positive_trigger_check;
ALTER TABLE public.job_roles ADD CONSTRAINT job_roles_positive_trigger_check CHECK (
  trigger_threshold IS NULL OR trigger_threshold > 0
);

CREATE INDEX IF NOT EXISTS job_roles_functional_parent_idx
  ON public.job_roles(functional_reports_to_role_id);
CREATE INDEX IF NOT EXISTS job_roles_occupancy_status_idx
  ON public.job_roles(occupancy_status);
CREATE INDEX IF NOT EXISTS job_roles_recommendation_status_idx
  ON public.job_roles(recommendation_status);

CREATE TABLE IF NOT EXISTS public.organization_hierarchy_trigger_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('cargo','camada','area')),
  role_id uuid REFERENCES public.job_roles(id) ON DELETE CASCADE,
  area_id uuid REFERENCES public.organization_areas(id) ON DELETE CASCADE,
  organization_tier text,
  metric text NOT NULL CHECK (metric IN (
    'membros_area','subordinados_diretos','cargos_area','equipes_area',
    'unidades','areas','volume_mensal','turnos','complexidade','manual'
  )),
  threshold numeric NOT NULL CHECK (threshold > 0),
  label text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  critical_after_days integer NOT NULL DEFAULT 60 CHECK (critical_after_days >= 0),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope_type='cargo' AND role_id IS NOT NULL AND area_id IS NULL AND organization_tier IS NULL) OR
    (scope_type='camada' AND role_id IS NULL AND area_id IS NULL AND organization_tier IS NOT NULL) OR
    (scope_type='area' AND role_id IS NULL AND area_id IS NOT NULL AND organization_tier IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_hierarchy_trigger_rules_unique
  ON public.organization_hierarchy_trigger_rules(
    scope_type,
    coalesce(role_id::text,''),
    coalesce(area_id::text,''),
    coalesce(organization_tier,''),
    metric,
    priority
  );
ALTER TABLE public.organization_hierarchy_trigger_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.organization_hierarchy_trigger_rules TO authenticated;
GRANT ALL ON public.organization_hierarchy_trigger_rules TO service_role;

DROP POLICY IF EXISTS hierarchy_trigger_rules_read ON public.organization_hierarchy_trigger_rules;
CREATE POLICY hierarchy_trigger_rules_read ON public.organization_hierarchy_trigger_rules
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS hierarchy_trigger_rules_manage ON public.organization_hierarchy_trigger_rules;
CREATE POLICY hierarchy_trigger_rules_manage ON public.organization_hierarchy_trigger_rules
  FOR ALL TO authenticated
  USING (public.app_has_cap((select auth.uid()), 'manage_team'))
  WITH CHECK (public.app_has_cap((select auth.uid()), 'manage_team'));

INSERT INTO public.organization_hierarchy_trigger_rules
  (scope_type, organization_tier, metric, threshold, label, priority)
VALUES
  ('camada','assistente','subordinados_diretos',4,'Profissionais que precisam de suporte',100),
  ('camada','assistente_geral','subordinados_diretos',4,'Assistentes de area ativos',100),
  ('camada','analista','membros_area',5,'Membros ativos na area',100),
  ('camada','analista_geral','subordinados_diretos',4,'Analistas ativos',100),
  ('camada','supervisor','subordinados_diretos',6,'Subordinados diretos',100),
  ('camada','supervisor_geral','subordinados_diretos',3,'Supervisores ativos',100),
  ('camada','gerente','membros_area',12,'Membros ativos na area',100),
  ('camada','gerente_geral','subordinados_diretos',3,'Gerentes ativos',100),
  ('camada','gestor','membros_area',25,'Membros ativos na area',100),
  ('camada','gestor_executivo','subordinados_diretos',3,'Gestores ativos',100),
  ('camada','diretor','subordinados_diretos',2,'Gestores ou gerentes na area',100)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION private.prevent_occupied_role_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.member_job_assignments
    WHERE job_role_id = OLD.id
  ) OR EXISTS (
    SELECT 1 FROM public.job_roles WHERE reports_to_role_id = OLD.id
  ) OR EXISTS (
    SELECT 1 FROM public.organization_history
    WHERE entity_type = 'job_roles' AND entity_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Cargo com vinculos, subordinados ou historico deve ser desativado, nao excluido.';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION private.prevent_occupied_role_delete() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_job_roles_protect_delete ON public.job_roles;
CREATE TRIGGER trg_job_roles_protect_delete
  BEFORE DELETE ON public.job_roles
  FOR EACH ROW EXECUTE FUNCTION private.prevent_occupied_role_delete();

-- Marca somente os cargos gerais reconhecidos como corporativos. Nao muda area, superior ou ocupacao.
UPDATE public.job_roles
SET is_corporate = true
WHERE system_key IN (
  'gestor_executivo','gerente_geral','supervisor_geral','analista_geral','assistente_geral'
)
  AND is_corporate = false;

