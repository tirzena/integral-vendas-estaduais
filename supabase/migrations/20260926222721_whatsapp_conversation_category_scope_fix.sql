DROP POLICY IF EXISTS whatsapp_conversations_scope_update ON public.whatsapp_conversations;
CREATE POLICY whatsapp_conversations_scope_update ON public.whatsapp_conversations
FOR UPDATE TO authenticated
USING (public.whatsapp_conversation_visible(id))
WITH CHECK (public.is_admin(auth.uid())
  OR (product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id))
  OR (account_id IS NOT NULL AND public.whatsapp_can_manage()
      AND public.whatsapp_account_visible(account_id)
      AND EXISTS (SELECT 1 FROM public.whatsapp_accounts a
                  WHERE a.id = whatsapp_conversations.account_id
                    AND whatsapp_conversations.product_id = ANY(a.product_ids))));