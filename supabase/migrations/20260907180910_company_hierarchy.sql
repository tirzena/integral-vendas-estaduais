-- Estrutura hierárquica dinâmica baseada nos cadastros existentes.
ALTER TABLE public.organization_areas
  ADD COLUMN IF NOT EXISTS parent_area_id uuid REFERENCES public.organization_areas(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#64748b',
  ADD COLUMN IF NOT EXISTS cost_center text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.job_roles
  ADD COLUMN IF NOT EXISTS reports_to_role_id uuid REFERENCES public.job_roles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS hierarchical_rank integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS planned_headcount integer NOT NULL DEFAULT 1 CHECK (planned_headcount > 0),
  ADD COLUMN IF NOT EXISTS allows_multiple_occupants boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS leadership boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS engagement_type text NOT NULL DEFAULT 'interno'
    CHECK (engagement_type IN ('interno','externo','societario','terceirizado')),
  ADD COLUMN IF NOT EXISTS responsibilities text;

ALTER TABLE public.member_job_assignments
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employment_type text NOT NULL DEFAULT 'funcionario',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS start_date date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS notes text;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS position
  FROM public.member_job_assignments
  WHERE end_date IS NULL
)
UPDATE public.member_job_assignments a
SET is_primary = true
FROM ranked r
WHERE a.id = r.id AND r.position = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.member_job_assignments current_primary
    WHERE current_primary.user_id = a.user_id
      AND current_primary.is_primary
      AND current_primary.end_date IS NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS member_job_assignments_one_primary_uq
  ON public.member_job_assignments(user_id)
  WHERE is_primary AND end_date IS NULL;
CREATE INDEX IF NOT EXISTS organization_areas_parent_idx ON public.organization_areas(parent_area_id);
CREATE INDEX IF NOT EXISTS job_roles_reports_to_idx ON public.job_roles(reports_to_role_id);
CREATE INDEX IF NOT EXISTS member_job_assignments_manager_idx ON public.member_job_assignments(manager_user_id);

CREATE TABLE IF NOT EXISTS public.organization_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  previous_data jsonb,
  new_data jsonb,
  reason text,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_history_created_idx
  ON public.organization_history(created_at DESC);

GRANT SELECT ON public.organization_history TO authenticated;
GRANT ALL ON public.organization_history TO service_role;
ALTER TABLE public.organization_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_history_read ON public.organization_history;
CREATE POLICY organization_history_read ON public.organization_history
  FOR SELECT TO authenticated
  USING (public.app_has_cap((select auth.uid()), 'manage_team'));

CREATE OR REPLACE FUNCTION private.prevent_organization_cycle()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE creates_cycle boolean;
BEGIN
  IF TG_TABLE_NAME = 'organization_areas' AND nullif(to_jsonb(NEW)->>'parent_area_id','') IS NOT NULL THEN
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_area_id FROM public.organization_areas WHERE id = (to_jsonb(NEW)->>'parent_area_id')::uuid
      UNION ALL
      SELECT a.id, a.parent_area_id FROM public.organization_areas a
      JOIN ancestors x ON a.id = x.parent_area_id
    ) SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id) INTO creates_cycle;
  ELSIF TG_TABLE_NAME = 'job_roles' AND nullif(to_jsonb(NEW)->>'reports_to_role_id','') IS NOT NULL THEN
    WITH RECURSIVE ancestors AS (
      SELECT id, reports_to_role_id FROM public.job_roles WHERE id = (to_jsonb(NEW)->>'reports_to_role_id')::uuid
      UNION ALL
      SELECT r.id, r.reports_to_role_id FROM public.job_roles r
      JOIN ancestors x ON r.id = x.reports_to_role_id
    ) SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id) INTO creates_cycle;
  END IF;
  IF creates_cycle THEN RAISE EXCEPTION 'A alteração criaria uma hierarquia circular.'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.prevent_organization_cycle() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_organization_areas_no_cycle ON public.organization_areas;
CREATE TRIGGER trg_organization_areas_no_cycle BEFORE INSERT OR UPDATE OF parent_area_id
  ON public.organization_areas FOR EACH ROW EXECUTE FUNCTION private.prevent_organization_cycle();
DROP TRIGGER IF EXISTS trg_job_roles_no_cycle ON public.job_roles;
CREATE TRIGGER trg_job_roles_no_cycle BEFORE INSERT OR UPDATE OF reports_to_role_id
  ON public.job_roles FOR EACH ROW EXECUTE FUNCTION private.prevent_organization_cycle();

CREATE OR REPLACE FUNCTION private.log_organization_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_payload jsonb; new_payload jsonb; row_id uuid;
BEGIN
  row_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  IF TG_TABLE_NAME = 'profiles' AND TG_OP = 'INSERT' THEN
    old_payload := NULL;
    new_payload := jsonb_build_object('id',NEW.id,'manager_id',NEW.manager_id,'is_active',NEW.is_active,'cargo',NEW.cargo,'setor',NEW.setor);
  ELSIF TG_TABLE_NAME = 'profiles' AND TG_OP = 'DELETE' THEN
    old_payload := jsonb_build_object('id',OLD.id,'manager_id',OLD.manager_id,'is_active',OLD.is_active,'cargo',OLD.cargo,'setor',OLD.setor);
    new_payload := NULL;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    old_payload := jsonb_build_object('id',OLD.id,'manager_id',OLD.manager_id,'is_active',OLD.is_active,'cargo',OLD.cargo,'setor',OLD.setor);
    new_payload := jsonb_build_object('id',NEW.id,'manager_id',NEW.manager_id,'is_active',NEW.is_active,'cargo',NEW.cargo,'setor',NEW.setor);
  ELSIF TG_OP = 'INSERT' THEN
    old_payload := NULL;
    new_payload := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    old_payload := to_jsonb(OLD);
    new_payload := NULL;
  ELSE
    old_payload := to_jsonb(OLD);
    new_payload := to_jsonb(NEW);
  END IF;
  INSERT INTO public.organization_history(entity_type, entity_id, action, previous_data, new_data, changed_by)
  VALUES (TG_TABLE_NAME, row_id, lower(TG_OP), old_payload, new_payload, (select auth.uid()));
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION private.log_organization_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_organization_areas_history ON public.organization_areas;
CREATE TRIGGER trg_organization_areas_history AFTER INSERT OR UPDATE OR DELETE ON public.organization_areas
  FOR EACH ROW EXECUTE FUNCTION private.log_organization_change();
DROP TRIGGER IF EXISTS trg_job_roles_history ON public.job_roles;
CREATE TRIGGER trg_job_roles_history AFTER INSERT OR UPDATE OR DELETE ON public.job_roles
  FOR EACH ROW EXECUTE FUNCTION private.log_organization_change();
DROP TRIGGER IF EXISTS trg_member_job_assignments_history ON public.member_job_assignments;
CREATE TRIGGER trg_member_job_assignments_history AFTER INSERT OR UPDATE OR DELETE ON public.member_job_assignments
  FOR EACH ROW EXECUTE FUNCTION private.log_organization_change();
DROP TRIGGER IF EXISTS trg_profiles_hierarchy_history ON public.profiles;
CREATE TRIGGER trg_profiles_hierarchy_history AFTER UPDATE OF manager_id, is_active, cargo, setor ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.log_organization_change();

UPDATE public.job_roles SET hierarchical_rank = CASE system_key
  WHEN 'fundador' THEN 10 WHEN 'diretor_geral' THEN 20 WHEN 'diretor_executivo' THEN 30
  WHEN 'diretor_marketing' THEN 40 WHEN 'diretor_financeiro' THEN 40 WHEN 'diretor_rh' THEN 40
  WHEN 'diretor_vendas' THEN 40 WHEN 'gestor_executivo' THEN 50 WHEN 'gerente' THEN 60
  WHEN 'assistente' THEN 120 ELSE 100 END,
  leadership = system_key IN ('fundador','diretor_geral','diretor_executivo','diretor_marketing','diretor_financeiro','diretor_rh','diretor_vendas','gestor_executivo','gerente');

UPDATE public.job_roles child SET reports_to_role_id = parent.id
FROM public.job_roles parent
WHERE (child.system_key, parent.system_key) IN (
  ('diretor_geral','fundador'), ('diretor_executivo','diretor_geral'),
  ('diretor_marketing','diretor_geral'), ('diretor_financeiro','diretor_geral'),
  ('diretor_rh','diretor_geral'), ('diretor_vendas','diretor_geral'),
  ('gestor_executivo','diretor_executivo'), ('gerente','gestor_executivo'),
  ('vendedor','diretor_vendas'), ('gestor_trafego','diretor_marketing'),
  ('social_media','diretor_marketing'), ('designer','diretor_marketing'),
  ('editor','diretor_marketing'), ('filmmaker','diretor_marketing'),
  ('analista_financeiro','diretor_financeiro'), ('profissional_rh','diretor_rh'),
  ('assistente','gestor_executivo'), ('desenvolvedor','diretor_executivo'),
  ('estoquista','gestor_executivo'), ('comprador','gestor_executivo'),
  ('entregador','gestor_executivo')
) AND child.reports_to_role_id IS NULL;

