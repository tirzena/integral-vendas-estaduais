-- Organiza o organograma em faixas claras, sem misturar liderança e execução.
ALTER TABLE public.job_roles
  ADD COLUMN IF NOT EXISTS organization_tier text NOT NULL DEFAULT 'cargo'
  CHECK (organization_tier IN ('fundador','conselho','diretor_geral','diretor','gestor_executivo','gestor','gerente','cargo','assistente'));

INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier,responsibilities)
SELECT id,'Conselho de Sócios','conselho_socios',20,true,'conselho',
  'Sócios administradores, sócios operacionais e sócios investidores.'
FROM public.organization_areas WHERE system_key='diretoria'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true,hierarchical_rank=20,
  leadership=true,organization_tier='conselho',responsibilities=EXCLUDED.responsibilities;

INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Assistente geral','assistente_geral',90,false,'assistente' FROM public.organization_areas WHERE system_key='operacoes'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true,organization_tier='assistente';
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Assistente de diretoria','assistente_diretoria',90,false,'assistente' FROM public.organization_areas WHERE system_key='diretoria'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true,organization_tier='assistente';
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Assistente de gestor','assistente_gestor',90,false,'assistente' FROM public.organization_areas WHERE system_key='operacoes'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true,organization_tier='assistente';
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Assistente de gerente','assistente_gerente',90,false,'assistente' FROM public.organization_areas WHERE system_key='operacoes'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true,organization_tier='assistente';
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Assistente de cargo','assistente_cargo',90,false,'assistente' FROM public.organization_areas WHERE system_key='operacoes'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true,organization_tier='assistente';

UPDATE public.job_roles SET organization_tier=CASE
  WHEN system_key='fundador' THEN 'fundador'
  WHEN system_key='conselho_socios' THEN 'conselho'
  WHEN system_key='diretor_geral' THEN 'diretor_geral'
  WHEN system_key LIKE 'diretor_%' OR lower(name) LIKE 'diretor %' THEN 'diretor'
  WHEN system_key='gestor_executivo' THEN 'gestor_executivo'
  WHEN system_key LIKE 'gestor_%' OR lower(name) LIKE 'gestor %' THEN 'gestor'
  WHEN system_key LIKE 'gerente%' OR lower(name) LIKE 'gerente %' THEN 'gerente'
  WHEN system_key LIKE 'assistente%' OR lower(name) LIKE 'assistente%' THEN 'assistente'
  ELSE 'cargo' END;

UPDATE public.job_roles SET hierarchical_rank=CASE organization_tier
  WHEN 'fundador' THEN 10 WHEN 'conselho' THEN 20 WHEN 'diretor_geral' THEN 30
  WHEN 'diretor' THEN 40 WHEN 'gestor_executivo' THEN 50 WHEN 'gestor' THEN 60
  WHEN 'gerente' THEN 70 WHEN 'cargo' THEN 80 WHEN 'assistente' THEN 90 END;

UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='conselho_socios' AND parent.system_key='fundador';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='diretor_geral' AND parent.system_key='conselho_socios';

-- O gestor executivo vem depois do conjunto de diretorias e responde à direção geral.
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='gestor_executivo' AND parent.system_key='diretor_geral';

UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='assistente_geral' AND parent.system_key='fundador';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='assistente_diretoria' AND parent.system_key='diretor_geral';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='assistente_gestor' AND parent.system_key='gestor_executivo';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='assistente_gerente' AND parent.system_key='gerente_equipe_vendas';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent WHERE child.system_key='assistente_cargo' AND parent.system_key='vendedor';

-- O cargo antigo genérico continua disponível como assistência operacional.
UPDATE public.job_roles SET name='Assistente operacional', organization_tier='assistente', hierarchical_rank=90
WHERE system_key='assistente';
