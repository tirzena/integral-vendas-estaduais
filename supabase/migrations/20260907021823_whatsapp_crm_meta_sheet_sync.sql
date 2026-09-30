-- WhatsApp attribution and CRM qualification events.
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS referral jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_picture_url text;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS referral jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

ALTER TABLE public.meta_ad_accounts
  ADD COLUMN IF NOT EXISTS dataset_id text,
  ADD COLUMN IF NOT EXISTS dataset_name text;

CREATE TABLE IF NOT EXISTS public.meta_conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_product_id uuid NOT NULL REFERENCES public.customer_products(id) ON DELETE CASCADE,
  event_name text NOT NULL DEFAULT 'Lead',
  event_id text NOT NULL UNIQUE,
  dataset_id text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','ignorado','falhou')),
  response jsonb,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_conversion_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.meta_conversion_events TO authenticated;
GRANT ALL ON public.meta_conversion_events TO service_role;
CREATE POLICY "meta conversion admin read" ON public.meta_conversion_events
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_meta_conversion_events_updated BEFORE UPDATE ON public.meta_conversion_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A linked sheet belongs to one contact list and is synchronized by the user
-- who connected Google. Tokens stay encrypted in google_calendar_connections.
CREATE TABLE IF NOT EXISTS public.contact_sheet_links (
  list_id uuid PRIMARY KEY REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spreadsheet_id text NOT NULL,
  spreadsheet_title text,
  sheet_tab text NOT NULL,
  last_synced_at timestamptz,
  last_sync_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_sheet_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_sheet_links TO authenticated;
GRANT ALL ON public.contact_sheet_links TO service_role;
CREATE POLICY "contact sheet owner read" ON public.contact_sheet_links FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY "contact sheet owner insert" ON public.contact_sheet_links FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "contact sheet owner update" ON public.contact_sheet_links FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "contact sheet owner delete" ON public.contact_sheet_links FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE TRIGGER trg_contact_sheet_links_updated BEFORE UPDATE ON public.contact_sheet_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Every inbound WhatsApp contact is a visible opportunity in the first stage.
CREATE OR REPLACE FUNCTION public.whatsapp_upsert_contact(
  _account_id uuid, _phone text, _name text, _product_id uuid,
  _referral jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer uuid;
  v_pipeline uuid;
  v_stage uuid;
  v_ad text;
  v_campaign text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('wa_contact:' || _phone));
  SELECT id INTO v_customer FROM public.customers
   WHERE deleted_at IS NULL
     AND (regexp_replace(COALESCE(phone,''), '\D', '', 'g') = _phone
          OR regexp_replace(COALESCE(whatsapp,''), '\D', '', 'g') = _phone)
   ORDER BY created_at LIMIT 1;
  IF v_customer IS NULL THEN
    INSERT INTO public.customers (name, phone, whatsapp, origin, status)
    VALUES (COALESCE(NULLIF(_name,''), 'Contato ' || right(_phone, 4)), _phone, _phone, 'whatsapp', 'lead')
    RETURNING id INTO v_customer;
  END IF;
  IF _product_id IS NOT NULL THEN
    SELECT id INTO v_pipeline FROM public.pipelines
      WHERE product_id = _product_id AND is_default = true ORDER BY created_at LIMIT 1;
    SELECT id INTO v_stage FROM public.pipeline_stages
      WHERE pipeline_id = v_pipeline ORDER BY position LIMIT 1;
    v_ad := COALESCE(NULLIF(_referral->>'title',''), NULLIF(_referral->>'sourceId',''));
    v_campaign := NULLIF(_referral->>'body','');
    INSERT INTO public.customer_products
      (customer_id, product_id, pipeline_id, stage_id, commercial_status, lead_origin,
       channel, whatsapp_number, ad, campaign, notes)
    VALUES
      (v_customer, _product_id, v_pipeline, v_stage, 'lead',
       CASE WHEN _referral <> '{}'::jsonb THEN 'Anúncio da Meta · WhatsApp' ELSE 'WhatsApp' END,
       'whatsapp', _phone, v_ad, v_campaign,
       CASE WHEN NULLIF(_referral->>'sourceUrl','') IS NOT NULL
         THEN 'Origem do anúncio: ' || (_referral->>'sourceUrl') ELSE NULL END)
    ON CONFLICT (customer_id, product_id) DO UPDATE SET
      pipeline_id = COALESCE(public.customer_products.pipeline_id, EXCLUDED.pipeline_id),
      stage_id = COALESCE(public.customer_products.stage_id, EXCLUDED.stage_id),
      whatsapp_number = COALESCE(public.customer_products.whatsapp_number, EXCLUDED.whatsapp_number),
      lead_origin = CASE WHEN EXCLUDED.lead_origin LIKE 'Anúncio%' THEN EXCLUDED.lead_origin ELSE public.customer_products.lead_origin END,
      ad = COALESCE(EXCLUDED.ad, public.customer_products.ad),
      campaign = COALESCE(EXCLUDED.campaign, public.customer_products.campaign),
      notes = COALESCE(EXCLUDED.notes, public.customer_products.notes);
  END IF;
  RETURN v_customer;
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_upsert_contact(uuid,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_upsert_contact(uuid,text,text,uuid,jsonb) TO service_role;

-- Repair WhatsApp opportunities created before this migration.
UPDATE public.customer_products cp SET
  pipeline_id = p.id,
  stage_id = s.id,
  commercial_status = CASE WHEN cp.commercial_status = 'lead' THEN cp.commercial_status ELSE 'lead' END,
  lead_origin = COALESCE(cp.lead_origin, 'WhatsApp'),
  channel = COALESCE(cp.channel, 'whatsapp')
FROM public.pipelines p
JOIN LATERAL (
  SELECT ps.id FROM public.pipeline_stages ps WHERE ps.pipeline_id = p.id ORDER BY ps.position LIMIT 1
) s ON true
WHERE cp.product_id = p.product_id AND p.is_default = true
  AND cp.stage_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.whatsapp_conversations wc
    WHERE wc.customer_id = cp.customer_id AND wc.product_id = cp.product_id
  );
