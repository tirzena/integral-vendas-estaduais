-- Separa nivel hierarquico de area e cargo, mantendo a subordinacao em reports_to_role_id.
ALTER TABLE public.job_roles
  DROP CONSTRAINT IF EXISTS job_roles_organization_tier_check;

ALTER TABLE public.job_roles
  ADD CONSTRAINT job_roles_organization_tier_check CHECK (
    organization_tier IN (
      'fundador','conselho','socio','diretor_geral','diretor',
      'gestor_executivo','gestor','gerente_geral','gerente',
      'supervisor_geral','supervisor','analista_geral','analista',
      'assistente_geral','assistente','cargo'
    )
  );

-- Os tres tipos de socio sao cargos independentes, com perfis e permissoes proprios.
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier,responsibilities)
SELECT id,'Sócio administrador','socio_administrador',30,true,'socio','Administração societária e decisões delegadas pelo fundador.'
FROM public.organization_areas WHERE system_key='diretoria'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true,organization_tier='socio',responsibilities=EXCLUDED.responsibilities;

INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier,responsibilities)
SELECT id,'Sócio operacional','socio_operacional',31,true,'socio','Participação societária com atuação operacional.'
FROM public.organization_areas WHERE system_key='diretoria'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true,organization_tier='socio',responsibilities=EXCLUDED.responsibilities;

INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier,responsibilities)
SELECT id,'Sócio investidor','socio_investidor',32,false,'socio','Participação societária de investimento conforme acesso concedido pelo fundador.'
FROM public.organization_areas WHERE system_key='diretoria'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true,organization_tier='socio',responsibilities=EXCLUDED.responsibilities;

-- Cargos gerais marcam cada camada; os cargos especializados podem ser ligados ao superior real.
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Gerente geral','gerente_geral',90,true,'gerente_geral' FROM public.organization_areas WHERE system_key='gerencia'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true,organization_tier='gerente_geral',leadership=true;

INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Supervisor geral','supervisor_geral',110,true,'supervisor_geral' FROM public.organization_areas WHERE system_key='operacoes'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true,organization_tier='supervisor_geral',leadership=true;

INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Analista geral','analista_geral',130,true,'analista_geral' FROM public.organization_areas WHERE system_key='operacoes'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,active=true,organization_tier='analista_geral',leadership=true;

-- A faixa de gestores representa a lideranca de cada area sob o Gestor executivo.
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Gestor de marketing','gestor_marketing',70,true,'gestor' FROM public.organization_areas WHERE system_key='marketing'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,organization_tier='gestor',leadership=true;
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Gestor de vendas','gestor_vendas',71,true,'gestor' FROM public.organization_areas WHERE system_key='vendas'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,organization_tier='gestor',leadership=true;
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Gestor de RH','gestor_rh',72,true,'gestor' FROM public.organization_areas WHERE system_key='rh'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,organization_tier='gestor',leadership=true;
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Gestor financeiro','gestor_financeiro',73,true,'gestor' FROM public.organization_areas WHERE system_key='financeiro'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,organization_tier='gestor',leadership=true;
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Gestor contábil','gestor_contabil',74,true,'gestor' FROM public.organization_areas WHERE system_key='contabilidade'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,organization_tier='gestor',leadership=true;
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Gestor jurídico','gestor_juridico',75,true,'gestor' FROM public.organization_areas WHERE system_key='juridico'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,organization_tier='gestor',leadership=true;
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Gestor operacional','gestor_operacional',76,true,'gestor' FROM public.organization_areas WHERE system_key='operacoes'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,organization_tier='gestor',leadership=true;
INSERT INTO public.job_roles(area_id,name,system_key,hierarchical_rank,leadership,organization_tier)
SELECT id,'Gestor de tecnologia','gestor_tecnologia',77,true,'gestor' FROM public.organization_areas WHERE system_key='tecnologia'
ON CONFLICT(system_key) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,active=true,organization_tier='gestor',leadership=true;

UPDATE public.job_roles SET organization_tier=CASE
  WHEN system_key='fundador' THEN 'fundador'
  WHEN system_key='conselho_socios' THEN 'conselho'
  WHEN system_key LIKE 'socio_%' THEN 'socio'
  WHEN system_key='diretor_geral' THEN 'diretor_geral'
  WHEN system_key LIKE 'diretor_%' OR lower(name) LIKE 'diretor %' THEN 'diretor'
  WHEN system_key='gestor_executivo' THEN 'gestor_executivo'
  WHEN system_key='gestor_trafego' THEN 'cargo'
  WHEN system_key LIKE 'gestor_%' OR lower(name) LIKE 'gestor %' THEN 'gestor'
  WHEN system_key='gerente_geral' THEN 'gerente_geral'
  WHEN system_key LIKE 'gerente%' OR lower(name) LIKE 'gerente %' THEN 'gerente'
  WHEN system_key='supervisor_geral' THEN 'supervisor_geral'
  WHEN system_key LIKE 'supervisor%' OR lower(name) LIKE 'supervisor %' THEN 'supervisor'
  WHEN system_key='analista_geral' THEN 'analista_geral'
  WHEN system_key LIKE 'analista%' OR lower(name) LIKE 'analista %' THEN 'analista'
  WHEN system_key='assistente_geral' THEN 'assistente_geral'
  WHEN system_key LIKE 'assistente%' OR lower(name) LIKE 'assistente%' THEN 'assistente'
  ELSE 'cargo' END;

UPDATE public.job_roles SET hierarchical_rank=CASE organization_tier
  WHEN 'fundador' THEN 10 WHEN 'conselho' THEN 20 WHEN 'socio' THEN 30
  WHEN 'diretor_geral' THEN 40 WHEN 'diretor' THEN 50
  WHEN 'gestor_executivo' THEN 60 WHEN 'gestor' THEN 70
  WHEN 'gerente_geral' THEN 80 WHEN 'gerente' THEN 90
  WHEN 'supervisor_geral' THEN 100 WHEN 'supervisor' THEN 110
  WHEN 'analista_geral' THEN 120 WHEN 'analista' THEN 130
  WHEN 'assistente_geral' THEN 140 WHEN 'assistente' THEN 150
  WHEN 'cargo' THEN 160 END;

UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent
WHERE child.organization_tier='socio' AND parent.system_key='conselho_socios';

UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent
WHERE child.system_key='gerente_geral' AND parent.system_key='gestor_executivo';

UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent
WHERE child.organization_tier='gestor'
  AND child.system_key<>'gestor_executivo'
  AND parent.system_key='gestor_executivo';

UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent
WHERE child.system_key='gestor_trafego' AND parent.system_key='gestor_marketing';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent
WHERE child.system_key='supervisor_geral' AND parent.system_key='gerente_geral';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent
WHERE child.system_key='analista_geral' AND parent.system_key='supervisor_geral';
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent
WHERE child.system_key='assistente_geral' AND parent.system_key='analista_geral';

-- O diretor geral continua subordinado ao conselho, ao lado dos cargos societarios do conselho.
UPDATE public.job_roles child SET reports_to_role_id=parent.id
FROM public.job_roles parent
WHERE child.system_key='diretor_geral' AND parent.system_key='conselho_socios';
