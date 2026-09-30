ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS product_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE public.whatsapp_accounts
SET product_ids = ARRAY[product_id]
WHERE product_id IS NOT NULL AND cardinality(product_ids) = 0;

ALTER TABLE public.whatsapp_accounts
  ADD CONSTRAINT whatsapp_accounts_product_ids_consistent
  CHECK (product_id IS NULL OR product_id = ANY(product_ids));

CREATE INDEX IF NOT EXISTS whatsapp_accounts_product_ids_idx
  ON public.whatsapp_accounts USING gin (product_ids);

CREATE OR REPLACE FUNCTION public.whatsapp_account_visible(_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_accounts a
    WHERE a.id = _account_id AND a.deleted_at IS NULL
      AND (public.is_admin(auth.uid()) OR EXISTS (
        SELECT 1 FROM unnest(a.product_ids) AS categories(category_id)
        WHERE public.has_product_access(auth.uid(), category_id)
      ))
  )
$$;

DROP POLICY IF EXISTS whatsapp_accounts_scope_read ON public.whatsapp_accounts;
CREATE POLICY whatsapp_accounts_scope_read ON public.whatsapp_accounts
FOR SELECT TO authenticated
USING (deleted_at IS NULL AND (public.is_admin(auth.uid()) OR EXISTS (
  SELECT 1 FROM unnest(product_ids) AS categories(category_id)
  WHERE public.has_product_access(auth.uid(), category_id)
)));

DROP POLICY IF EXISTS whatsapp_accounts_manage ON public.whatsapp_accounts;
CREATE POLICY whatsapp_accounts_manage ON public.whatsapp_accounts
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR
  (public.whatsapp_can_manage() AND product_id IS NOT NULL
   AND public.has_product_access(auth.uid(), product_id)))
WITH CHECK (public.is_admin(auth.uid()) OR
  (public.whatsapp_can_manage() AND product_id IS NOT NULL
   AND product_id = ANY(product_ids)
   AND public.has_product_access(auth.uid(), product_id)
   AND NOT EXISTS (SELECT 1 FROM unnest(product_ids) AS categories(category_id)
                   WHERE NOT public.has_product_access(auth.uid(), category_id))));

CREATE OR REPLACE FUNCTION public.whatsapp_conversation_visible(_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_conversations c
    WHERE c.id = _conversation_id
      AND (
        public.is_admin(auth.uid())
        OR (c.product_id IS NOT NULL
            AND public.has_product_access(auth.uid(), c.product_id)
            AND (public.whatsapp_can_manage() OR c.assignee_id = auth.uid()))
        OR (c.account_id IS NOT NULL AND public.whatsapp_can_manage()
            AND public.whatsapp_account_visible(c.account_id))
      )
  )
$$;

DROP POLICY IF EXISTS whatsapp_conversations_scope_update ON public.whatsapp_conversations;
CREATE POLICY whatsapp_conversations_scope_update ON public.whatsapp_conversations
FOR UPDATE TO authenticated
USING (public.whatsapp_conversation_visible(id))
WITH CHECK (public.is_admin(auth.uid())
  OR (product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id))
  OR (account_id IS NOT NULL AND public.whatsapp_can_manage()
      AND public.whatsapp_account_visible(account_id)
      AND EXISTS (SELECT 1 FROM public.whatsapp_accounts a
                  WHERE a.id = account_id AND product_id = ANY(a.product_ids))));
