-- contas de WhatsApp: gestores com acesso à categoria também administram
DROP POLICY IF EXISTS "whatsapp_accounts_admin_manage" ON public.whatsapp_accounts;

CREATE POLICY "whatsapp_accounts_manage" ON public.whatsapp_accounts
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (
      public.whatsapp_can_manage()
      AND (product_id IS NULL OR public.has_product_access(auth.uid(), product_id))
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (
      public.whatsapp_can_manage()
      AND (product_id IS NULL OR public.has_product_access(auth.uid(), product_id))
    )
  );

-- conta remetente das campanhas de WhatsApp
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS whatsapp_account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.message_jobs
  ADD COLUMN IF NOT EXISTS whatsapp_account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_message_jobs_wa_account ON public.message_jobs(whatsapp_account_id);