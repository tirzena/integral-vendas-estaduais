-- Scripts e treinamentos podem ser gerais ou exclusivos de uma equipe.
ALTER TABLE public.sales_scripts
  ADD COLUMN IF NOT EXISTS visibility_scope text NOT NULL DEFAULT 'geral'
    CHECK (visibility_scope IN ('geral','equipe')),
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS sales_scripts_team_idx ON public.sales_scripts(team_id);
DROP POLICY IF EXISTS sales_scripts_read ON public.sales_scripts;
DROP POLICY IF EXISTS sales_scripts_visibility_read ON public.sales_scripts;
CREATE POLICY sales_scripts_visibility_read ON public.sales_scripts FOR SELECT TO authenticated
USING (
  visibility_scope='geral' OR public.is_admin(auth.uid()) OR created_by=auth.uid()
  OR (team_id IS NOT NULL AND (
    EXISTS(SELECT 1 FROM public.team_members tm WHERE tm.team_id=sales_scripts.team_id AND tm.user_id=auth.uid())
    OR EXISTS(SELECT 1 FROM public.teams t WHERE t.id=sales_scripts.team_id AND t.manager_id=auth.uid())
  ))
);

-- Complementos pedidos para o organograma jurídico, contábil e comercial.
INSERT INTO public.organization_areas(name,system_key,sort_order,color) VALUES
  ('Jurídico','juridico',75,'#7c3aed'),
  ('Contabilidade','contabilidade',65,'#0f766e')
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true;

INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership)
SELECT id,'Diretor jurídico','diretor_juridico',40,true FROM public.organization_areas WHERE system_key='juridico'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,hierarchical_rank=40,leadership=true;
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership)
SELECT id,'Contador','contador',70,false FROM public.organization_areas WHERE system_key='contabilidade'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,hierarchical_rank=70;
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership)
SELECT id,'Gestor de vendas','gestor_vendas',50,true FROM public.organization_areas WHERE system_key='vendas'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,hierarchical_rank=50,leadership=true;
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership)
SELECT id,'Gerente de equipe de vendas','gerente_equipe_vendas',60,true FROM public.organization_areas WHERE system_key='vendas'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,hierarchical_rank=60,leadership=true;
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership)
SELECT id,'Assistente de vendedor','assistente_vendedor',90,false FROM public.organization_areas WHERE system_key='vendas'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,hierarchical_rank=90;

UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='diretor_juridico' AND parent.system_key='diretor_geral';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='contador' AND parent.system_key='diretor_financeiro';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='gestor_vendas' AND parent.system_key='diretor_vendas';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='gerente_equipe_vendas' AND parent.system_key='gestor_vendas';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='vendedor' AND parent.system_key='gerente_equipe_vendas';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='assistente_vendedor' AND parent.system_key='vendedor';
