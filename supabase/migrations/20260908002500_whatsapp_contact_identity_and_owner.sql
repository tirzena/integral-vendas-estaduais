-- WhatsApp: responsável da conta vira dono inicial do atendimento e do lead.
CREATE OR REPLACE FUNCTION private.whatsapp_default_assignee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.assignee_id IS NULL AND NEW.account_id IS NOT NULL THEN
    SELECT a.created_by INTO NEW.assignee_id
    FROM public.whatsapp_accounts a WHERE a.id=NEW.account_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.whatsapp_default_assignee() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_whatsapp_default_assignee ON public.whatsapp_conversations;
CREATE TRIGGER trg_whatsapp_default_assignee
BEFORE INSERT ON public.whatsapp_conversations
FOR EACH ROW EXECUTE FUNCTION private.whatsapp_default_assignee();

CREATE OR REPLACE FUNCTION public.whatsapp_upsert_contact(
  _account_id uuid, _phone text, _name text, _product_id uuid,
  _referral jsonb DEFAULT '{}'::jsonb, _owner_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_customer uuid;
  v_pipeline uuid;
  v_stage uuid;
  v_ad text;
  v_campaign text;
  v_team uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('wa_contact:' || _phone));
  IF _owner_id IS NOT NULL THEN
    SELECT team_id INTO v_team FROM (
      SELECT tm.team_id,0 AS priority FROM public.team_members tm WHERE tm.user_id=_owner_id
      UNION ALL
      SELECT t.id,1 FROM public.teams t WHERE t.manager_id=_owner_id
    ) linked ORDER BY priority,team_id LIMIT 1;
  END IF;

  SELECT id INTO v_customer FROM public.customers
   WHERE deleted_at IS NULL
     AND (regexp_replace(COALESCE(phone,''), '\D', '', 'g')=_phone
          OR regexp_replace(COALESCE(whatsapp,''), '\D', '', 'g')=_phone)
   ORDER BY created_at LIMIT 1;
  IF v_customer IS NULL THEN
    INSERT INTO public.customers(name,phone,whatsapp,origin,status,created_by)
    VALUES(COALESCE(NULLIF(trim(_name),''),'Contato '||right(_phone,4)),_phone,_phone,'whatsapp','lead',_owner_id)
    RETURNING id INTO v_customer;
  ELSIF NULLIF(trim(_name),'') IS NOT NULL THEN
    UPDATE public.customers SET
      name=CASE WHEN name IS NULL OR trim(name)='' OR name LIKE 'Contato %' THEN trim(_name) ELSE name END,
      phone=COALESCE(phone,_phone),whatsapp=COALESCE(whatsapp,_phone),updated_at=now()
    WHERE id=v_customer;
  END IF;

  IF _product_id IS NOT NULL THEN
    SELECT id INTO v_pipeline FROM public.pipelines
      WHERE product_id=_product_id AND is_default=true ORDER BY created_at LIMIT 1;
    SELECT id INTO v_stage FROM public.pipeline_stages
      WHERE pipeline_id=v_pipeline ORDER BY position LIMIT 1;
    v_ad:=COALESCE(NULLIF(_referral->>'title',''),NULLIF(_referral->>'sourceId',''));
    v_campaign:=NULLIF(_referral->>'body','');
    INSERT INTO public.customer_products(
      customer_id,product_id,owner_id,team_id,pipeline_id,stage_id,commercial_status,
      lead_origin,channel,whatsapp_number,ad,campaign,notes)
    VALUES(
      v_customer,_product_id,_owner_id,v_team,v_pipeline,v_stage,'lead',
      CASE WHEN _referral<>'{}'::jsonb THEN 'Anúncio da Meta · WhatsApp' ELSE 'WhatsApp' END,
      'whatsapp',_phone,v_ad,v_campaign,
      CASE WHEN NULLIF(_referral->>'sourceUrl','') IS NOT NULL
        THEN 'Origem do anúncio: '||(_referral->>'sourceUrl') ELSE NULL END)
    ON CONFLICT(customer_id,product_id) DO UPDATE SET
      owner_id=COALESCE(public.customer_products.owner_id,EXCLUDED.owner_id),
      team_id=COALESCE(public.customer_products.team_id,EXCLUDED.team_id),
      pipeline_id=COALESCE(public.customer_products.pipeline_id,EXCLUDED.pipeline_id),
      stage_id=COALESCE(public.customer_products.stage_id,EXCLUDED.stage_id),
      whatsapp_number=COALESCE(public.customer_products.whatsapp_number,EXCLUDED.whatsapp_number),
      lead_origin=CASE WHEN EXCLUDED.lead_origin LIKE 'Anúncio%' THEN EXCLUDED.lead_origin ELSE public.customer_products.lead_origin END,
      ad=COALESCE(EXCLUDED.ad,public.customer_products.ad),
      campaign=COALESCE(EXCLUDED.campaign,public.customer_products.campaign),
      notes=COALESCE(EXCLUDED.notes,public.customer_products.notes);
  END IF;

  IF _owner_id IS NOT NULL THEN
    UPDATE public.contact_leads SET assigned_to=_owner_id,updated_at=now()
    WHERE assigned_to IS NULL AND regexp_replace(COALESCE(phone,''),'\D','','g')=_phone;
  END IF;
  RETURN v_customer;
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_upsert_contact(uuid,text,text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_upsert_contact(uuid,text,text,uuid,jsonb,uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.whatsapp_user_in_team(_user uuid,_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.team_members tm WHERE tm.user_id=_user AND tm.team_id=_team)
      OR EXISTS(SELECT 1 FROM public.teams t WHERE t.id=_team AND t.manager_id=_user)
$$;
REVOKE ALL ON FUNCTION private.whatsapp_user_in_team(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.whatsapp_team_assignees(_conversation_id uuid)
RETURNS TABLE(id uuid,full_name text,email text,avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH base AS (
    SELECT COALESCE(c.assignee_id,a.created_by,auth.uid()) AS user_id
    FROM public.whatsapp_conversations c
    LEFT JOIN public.whatsapp_accounts a ON a.id=c.account_id
    WHERE c.id=_conversation_id AND public.whatsapp_conversation_visible(c.id)
  ), linked_teams AS (
    SELECT tm.team_id FROM public.team_members tm JOIN base b ON b.user_id=tm.user_id
    UNION SELECT t.id FROM public.teams t JOIN base b ON b.user_id=t.manager_id
  ), allowed AS (
    SELECT tm.user_id FROM public.team_members tm JOIN linked_teams lt ON lt.team_id=tm.team_id
    UNION SELECT t.manager_id FROM public.teams t JOIN linked_teams lt ON lt.team_id=t.id WHERE t.manager_id IS NOT NULL
    UNION SELECT user_id FROM base
  )
  SELECT DISTINCT p.id,p.full_name,p.email,p.avatar_url
  FROM public.profiles p JOIN allowed a ON a.user_id=p.id
  WHERE p.is_active ORDER BY p.full_name,p.email
$$;
REVOKE ALL ON FUNCTION public.whatsapp_team_assignees(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_team_assignees(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.whatsapp_assign_conversation(_conversation_id uuid,_assignee uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.whatsapp_conversations%ROWTYPE; base_user uuid; shared boolean; target_team uuid;
BEGIN
  SELECT * INTO c FROM public.whatsapp_conversations WHERE id=_conversation_id;
  IF c.id IS NULL OR NOT public.whatsapp_conversation_visible(_conversation_id) THEN
    RAISE EXCEPTION 'Conversa fora do seu acesso.';
  END IF;
  SELECT COALESCE(c.assignee_id,a.created_by,auth.uid()) INTO base_user
  FROM public.whatsapp_accounts a WHERE a.id=c.account_id;
  base_user:=COALESCE(base_user,c.assignee_id,auth.uid());
  IF _assignee IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=_assignee AND p.is_active) THEN
    RAISE EXCEPTION 'Responsável inválido.';
  END IF;
  IF NOT (public.is_admin(auth.uid()) OR c.assignee_id=auth.uid() OR base_user=auth.uid() OR EXISTS(
    SELECT 1 FROM public.teams t
    WHERE t.manager_id=auth.uid() AND private.whatsapp_user_in_team(base_user,t.id)
  )) THEN
    RAISE EXCEPTION 'Sem permissão para transferir este contato.';
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.team_members mine JOIN public.team_members target ON target.team_id=mine.team_id
    WHERE mine.user_id=base_user AND target.user_id=_assignee
    UNION ALL
    SELECT 1 FROM public.teams t
    WHERE (t.manager_id=base_user AND private.whatsapp_user_in_team(_assignee,t.id))
       OR (t.manager_id=_assignee AND private.whatsapp_user_in_team(base_user,t.id))
  ) INTO shared;
  IF _assignee<>base_user AND NOT COALESCE(shared,false) THEN
    RAISE EXCEPTION 'O novo responsável precisa pertencer à mesma equipe.';
  END IF;
  SELECT tm.team_id INTO target_team FROM public.team_members tm WHERE tm.user_id=_assignee ORDER BY tm.created_at LIMIT 1;
  UPDATE public.whatsapp_conversations SET assignee_id=_assignee,updated_at=now() WHERE id=c.id;
  UPDATE public.customer_products SET owner_id=_assignee,team_id=COALESCE(target_team,team_id),updated_at=now()
    WHERE customer_id=c.customer_id AND (c.product_id IS NULL OR product_id=c.product_id);
  UPDATE public.contact_leads SET assigned_to=_assignee,updated_at=now()
    WHERE regexp_replace(COALESCE(phone,''),'\D','','g')=regexp_replace(c.contact_phone,'\D','','g');
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_assign_conversation(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_assign_conversation(uuid,uuid) TO authenticated;

UPDATE public.whatsapp_conversations c SET assignee_id=a.created_by
FROM public.whatsapp_accounts a
WHERE c.account_id=a.id AND c.assignee_id IS NULL AND a.created_by IS NOT NULL;

UPDATE public.customer_products cp SET owner_id=c.assignee_id,
  team_id=COALESCE(cp.team_id,(SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id=c.assignee_id ORDER BY tm.created_at LIMIT 1)),
  updated_at=now()
FROM public.whatsapp_conversations c
WHERE cp.customer_id=c.customer_id AND cp.owner_id IS NULL AND c.assignee_id IS NOT NULL
  AND (c.product_id IS NULL OR cp.product_id=c.product_id);
