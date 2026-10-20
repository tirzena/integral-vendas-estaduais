CREATE OR REPLACE FUNCTION private.guard_notification_acknowledgement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF private.seller_is_restricted(auth.uid()) AND (
 OLD.user_id IS DISTINCT FROM auth.uid() OR NEW.read_at IS NULL
 OR (to_jsonb(NEW)-'read_at') IS DISTINCT FROM (to_jsonb(OLD)-'read_at')
 ) THEN RAISE EXCEPTION 'Somente a leitura da própria notificação pode ser confirmada.' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.guard_notification_acknowledgement() FROM PUBLIC,anon,authenticated;
DROP TRIGGER a_seller_portal_write ON public.notifications;
CREATE TRIGGER a_seller_portal_write BEFORE INSERT OR DELETE OR TRUNCATE ON public.notifications
FOR EACH STATEMENT EXECUTE FUNCTION private.seller_write_guard();
CREATE TRIGGER guard_notification_acknowledgement BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION private.guard_notification_acknowledgement();
