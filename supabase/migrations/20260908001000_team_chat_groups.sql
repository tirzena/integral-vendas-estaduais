-- Cada equipe mantém um grupo automático no chat interno com os membros atuais.
CREATE OR REPLACE FUNCTION private.sync_team_chat(_team_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE conv_id uuid; team_name text; team_manager uuid;
BEGIN
  SELECT name,manager_id INTO team_name,team_manager FROM public.teams WHERE id=_team_id;
  IF team_name IS NULL THEN RETURN; END IF;

  SELECT id INTO conv_id FROM public.internal_conversations
  WHERE team_id=_team_id AND is_auto ORDER BY created_at LIMIT 1;
  IF conv_id IS NULL THEN
    INSERT INTO public.internal_conversations(name,conversation_type,team_id,is_auto,created_by)
    VALUES('Equipe · '||team_name,'grupo',_team_id,true,team_manager)
    RETURNING id INTO conv_id;
  ELSE
    UPDATE public.internal_conversations SET name='Equipe · '||team_name,updated_at=now()
    WHERE id=conv_id;
  END IF;

  INSERT INTO public.internal_conversation_members(conversation_id,user_id)
  SELECT conv_id,member_id FROM (
    SELECT tm.user_id AS member_id FROM public.team_members tm WHERE tm.team_id=_team_id
    UNION SELECT team_manager WHERE team_manager IS NOT NULL
  ) desired
  ON CONFLICT (conversation_id,user_id) DO NOTHING;

  DELETE FROM public.internal_conversation_members cm
  WHERE cm.conversation_id=conv_id
    AND cm.user_id NOT IN (
      SELECT tm.user_id FROM public.team_members tm WHERE tm.team_id=_team_id
      UNION SELECT team_manager WHERE team_manager IS NOT NULL
    );
END $$;
REVOKE ALL ON FUNCTION private.sync_team_chat(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.sync_team_chat_from_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.sync_team_chat(CASE WHEN TG_OP='DELETE' THEN OLD.team_id ELSE NEW.team_id END);
  IF TG_OP='UPDATE' AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    PERFORM private.sync_team_chat(OLD.team_id);
  END IF;
  RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION private.sync_team_chat_from_member() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.sync_team_chat_from_team()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.sync_team_chat(NEW.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sync_team_chat_from_team() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_sync_team_chat_members ON public.team_members;
CREATE TRIGGER trg_sync_team_chat_members AFTER INSERT OR UPDATE OR DELETE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION private.sync_team_chat_from_member();
DROP TRIGGER IF EXISTS trg_sync_team_chat_team ON public.teams;
CREATE TRIGGER trg_sync_team_chat_team AFTER INSERT OR UPDATE OF name,manager_id ON public.teams
FOR EACH ROW EXECUTE FUNCTION private.sync_team_chat_from_team();

DO $$ DECLARE team_row record; BEGIN
  FOR team_row IN SELECT id FROM public.teams LOOP
    PERFORM private.sync_team_chat(team_row.id);
  END LOOP;
END $$;
