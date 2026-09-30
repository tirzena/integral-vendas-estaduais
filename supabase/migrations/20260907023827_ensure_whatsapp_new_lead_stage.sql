-- Prefer the stage explicitly named "Novo lead" (or "Lead novo") for a new
-- WhatsApp opportunity. Pipelines without that label keep using position 1.
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
  SELECT id INTO v_customer FROM public.customers
    WHERE regexp_replace(COALESCE(whatsapp, phone, ''), '\D', '', 'g') = regexp_replace(_phone, '\D', '', 'g')
    ORDER BY created_at LIMIT 1;
  IF v_customer IS NULL THEN
    INSERT INTO public.customers (name, phone, whatsapp, origin, status, notes)
    VALUES (COALESCE(NULLIF(_name,''), _phone), _phone, _phone, 'WhatsApp', 'lead',
      CASE WHEN _referral <> '{}'::jsonb THEN 'Lead recebido por anúncio da Meta no WhatsApp' ELSE NULL END)
    RETURNING id INTO v_customer;
  ELSE
    UPDATE public.customers SET
      name = CASE WHEN (name IS NULL OR name = '' OR name = phone) AND NULLIF(_name,'') IS NOT NULL THEN _name ELSE name END,
      whatsapp = COALESCE(whatsapp, _phone), updated_at = now()
    WHERE id = v_customer;
  END IF;
  IF _product_id IS NOT NULL THEN
    SELECT id INTO v_pipeline FROM public.pipelines
      WHERE product_id = _product_id AND is_default = true ORDER BY created_at LIMIT 1;
    SELECT id INTO v_stage FROM public.pipeline_stages
      WHERE pipeline_id = v_pipeline
      ORDER BY
        CASE
          WHEN lower(name) LIKE '%novo%lead%' OR lower(name) LIKE '%lead%novo%' THEN 0
          ELSE 1
        END,
        position
      LIMIT 1;
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
