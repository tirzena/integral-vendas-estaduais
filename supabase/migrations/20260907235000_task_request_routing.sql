-- Solicitações internas entram pela liderança da equipe antes de chegar ao executor.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'tarefa',
  ADD COLUMN IF NOT EXISTS request_category text,
  ADD COLUMN IF NOT EXISTS request_stage text NOT NULL DEFAULT 'execucao',
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routed_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_request_kind_check
    CHECK (request_kind IN ('tarefa','solicitacao'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_request_stage_check
    CHECK (request_stage IN ('triagem','encaminhada','execucao','concluida'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.task_routing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_routing_history_task_idx
  ON public.task_routing_history(task_id,created_at);
GRANT SELECT,INSERT ON public.task_routing_history TO authenticated;
GRANT ALL ON public.task_routing_history TO service_role;
ALTER TABLE public.task_routing_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_routing_history_read ON public.task_routing_history;
CREATE POLICY task_routing_history_read ON public.task_routing_history FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS task_routing_history_insert ON public.task_routing_history;
CREATE POLICY task_routing_history_insert ON public.task_routing_history FOR INSERT TO authenticated
  WITH CHECK (actor_id=(select auth.uid()) OR public.is_admin((select auth.uid())));

CREATE OR REPLACE FUNCTION public.task_initial_reviewer(_uid uuid,_team_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(
    (SELECT t.manager_id FROM public.teams t
      WHERE t.id=_team_id
        AND (public.is_admin(_uid) OR EXISTS (
          SELECT 1 FROM public.team_members tm WHERE tm.team_id=t.id AND tm.user_id=_uid
        ))
        AND t.manager_id IS NOT NULL LIMIT 1),
    (SELECT a.manager_user_id FROM public.member_job_assignments a
      WHERE a.user_id=_uid AND a.end_date IS NULL AND a.manager_user_id IS NOT NULL
      ORDER BY a.is_primary DESC,a.created_at LIMIT 1),
    (SELECT p.manager_id FROM public.profiles p WHERE p.id=_uid),
    (SELECT t.manager_id FROM public.team_members tm
      JOIN public.teams t ON t.id=tm.team_id
      WHERE tm.user_id=_uid AND t.manager_id IS NOT NULL
      ORDER BY tm.created_at LIMIT 1)
  )
$$;
REVOKE ALL ON FUNCTION public.task_initial_reviewer(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.task_initial_reviewer(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.task_can_receive_request(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.is_admin(_uid)
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_uid AND ur.role='gestor')
    OR EXISTS (
      SELECT 1 FROM public.member_job_assignments a
      JOIN public.job_roles r ON r.id=a.job_role_id
      JOIN public.organization_areas ar ON ar.id=r.area_id
      WHERE a.user_id=_uid AND a.end_date IS NULL AND a.status='ativo'
        AND (r.leadership OR ar.system_key IN ('criacao','marketing','tecnologia','gerencia','diretoria'))
    )
$$;
REVOKE ALL ON FUNCTION public.task_can_receive_request(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.task_can_receive_request(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.task_request_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=(select auth.uid()); reviewer uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF TG_OP='INSERT' AND NEW.request_kind='solicitacao' THEN
    reviewer:=public.task_initial_reviewer(uid,NEW.team_id);
    IF reviewer IS NULL THEN
      RAISE EXCEPTION 'Sua equipe ainda não possui um responsável configurado para receber solicitações.';
    END IF;
    NEW.creator_id:=uid;
    NEW.requested_by:=uid;
    NEW.assignee_id:=reviewer;
    NEW.request_stage:='triagem';
  ELSIF TG_OP='UPDATE' AND OLD.request_kind='solicitacao' AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    IF NOT (public.is_admin(uid) OR OLD.assignee_id=uid OR public.has_role(uid,'gestor')) THEN
      RAISE EXCEPTION 'Somente o responsável atual ou um gestor pode encaminhar esta solicitação.';
    END IF;
    IF NEW.assignee_id IS NULL OR NOT public.task_can_receive_request(NEW.assignee_id) THEN
      RAISE EXCEPTION 'Encaminhe para um membro de criação, marketing, tecnologia ou gestão.';
    END IF;
    NEW.routed_by:=uid;
    NEW.routed_at:=now();
    NEW.request_stage:='encaminhada';
  END IF;
  IF NEW.request_kind='solicitacao' AND NEW.status='concluida' THEN NEW.request_stage:='concluida'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_task_request_guard ON public.tasks;
CREATE TRIGGER trg_task_request_guard BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.task_request_guard();

CREATE OR REPLACE FUNCTION public.task_request_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.request_kind='solicitacao' THEN
    INSERT INTO public.task_routing_history(task_id,to_user_id,actor_id,action,note)
    VALUES(NEW.id,NEW.assignee_id,NEW.requested_by,'solicitada','Solicitação enviada ao responsável da equipe.');
  ELSIF TG_OP='UPDATE' AND NEW.request_kind='solicitacao' AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO public.task_routing_history(task_id,from_user_id,to_user_id,actor_id,action,note)
    VALUES(NEW.id,OLD.assignee_id,NEW.assignee_id,NEW.routed_by,'encaminhada','Demanda encaminhada ao setor responsável.');
  ELSIF TG_OP='UPDATE' AND NEW.request_kind='solicitacao' AND NEW.status='concluida' AND OLD.status IS DISTINCT FROM 'concluida' THEN
    INSERT INTO public.task_routing_history(task_id,from_user_id,to_user_id,actor_id,action,note)
    VALUES(NEW.id,NEW.assignee_id,NEW.assignee_id,(select auth.uid()),'concluida','Solicitação concluída.');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_task_request_history ON public.tasks;
CREATE TRIGGER trg_task_request_history AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.task_request_history();

CREATE OR REPLACE FUNCTION public.task_request_recipients()
RETURNS TABLE(id uuid,full_name text,area_name text,role_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT DISTINCT p.id,p.full_name,ar.name,r.name
  FROM public.profiles p
  JOIN public.member_job_assignments a ON a.user_id=p.id AND a.end_date IS NULL AND a.status='ativo'
  JOIN public.job_roles r ON r.id=a.job_role_id
  JOIN public.organization_areas ar ON ar.id=r.area_id
  WHERE p.is_active AND (r.leadership OR ar.system_key IN ('criacao','marketing','tecnologia','gerencia','diretoria'))
  UNION
  SELECT DISTINCT p.id,p.full_name,'Gestão'::text,'Gestor'::text
  FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id
  WHERE p.is_active AND ur.role IN ('superadmin','admin','gestor')
  ORDER BY 2
$$;
REVOKE ALL ON FUNCTION public.task_request_recipients() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.task_request_recipients() TO authenticated,service_role;
