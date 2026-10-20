CREATE OR REPLACE FUNCTION private.notify_product_sale_price_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE old_currency text:=coalesce(OLD.price_currency,OLD.currency)::text;
new_currency text:=coalesce(NEW.price_currency,NEW.currency)::text;
BEGIN
 IF NOT public.is_admin(auth.uid()) OR NOT NEW.is_active
 OR (NEW.price IS NOT DISTINCT FROM OLD.price AND new_currency IS NOT DISTINCT FROM old_currency) THEN RETURN NEW; END IF;
 INSERT INTO public.notifications(user_id,title,body,link,notification_type)
 SELECT p.id,'Preço de produto atualizado',
 format('%s: de %s %s para %s %s. Confira os valores antes de fazer uma nova venda.',
 NEW.name,old_currency,coalesce(OLD.price::text,'sob consulta'),new_currency,coalesce(NEW.price::text,'sob consulta')),
 '/produtos','product_price_changed'
 FROM public.profiles p
 WHERE p.is_active AND p.id IS DISTINCT FROM auth.uid()
 AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='vendedor')
 AND private.seller_item_allowed(p.id,NEW.id);
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.notify_product_sale_price_change() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS notify_product_sale_price_change ON public.inventory_items;
CREATE TRIGGER notify_product_sale_price_change AFTER UPDATE OF price,price_currency,currency ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION private.notify_product_sale_price_change();
-- Retain seller write restrictions; allow only recipient-scoped notification reads.
ALTER POLICY seller_portal_read ON public.notifications
USING (NOT private.seller_is_restricted((SELECT auth.uid())) OR user_id=(SELECT auth.uid()));
-- A narrow acknowledgement RPC avoids granting sellers arbitrary notification updates.
CREATE OR REPLACE FUNCTION public.acknowledge_my_notifications()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.' USING ERRCODE='42501'; END IF;
 UPDATE public.notifications SET read_at=now() WHERE user_id=auth.uid() AND read_at IS NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.acknowledge_my_notifications() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_my_notifications() TO authenticated;
