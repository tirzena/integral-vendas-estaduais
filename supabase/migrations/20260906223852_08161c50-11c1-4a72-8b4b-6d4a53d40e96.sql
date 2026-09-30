REVOKE EXECUTE ON FUNCTION public.tracking_close_on_order_end() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.whatsapp_account_visible(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.whatsapp_can_manage() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.whatsapp_conversation_visible(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.whatsapp_account_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_can_manage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_conversation_visible(uuid) TO authenticated;