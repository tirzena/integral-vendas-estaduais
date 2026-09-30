-- Normalizadores
CREATE OR REPLACE FUNCTION public.campaigns_norm_phone(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN _v IS NULL THEN NULL
    WHEN length(regexp_replace(_v, '\D', '', 'g')) < 10 THEN NULL
    WHEN length(regexp_replace(_v, '\D', '', 'g')) IN (10,11)
      THEN '+55' || regexp_replace(_v, '\D', '', 'g')
    ELSE '+' || regexp_replace(_v, '\D', '', 'g')
  END
$$;

CREATE OR REPLACE FUNCTION public.campaigns_norm_email(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN btrim(lower(coalesce(_v,''))) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
              THEN btrim(lower(_v)) ELSE NULL END
$$;

-- Público da campanha, calculado no servidor
CREATE OR REPLACE FUNCTION public.campaigns_audience(
  p_filters jsonb, p_channels text[], p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
RETURNS TABLE (
  customer_id uuid, name text, phone text, email text, city text,
  product_name text, seller_name text, channels text[], blocked_reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  prod uuid := nullif(f->>'productId','')::uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.campaigns_can_manage(uid) THEN
    IF prod IS NULL OR NOT public.has_product_access(uid, prod) THEN
      RAISE EXCEPTION 'Selecione uma categoria à qual você tem acesso.';
    END IF;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT c.*,
      public.campaigns_norm_phone(coalesce(c.whatsapp, c.phone)) AS np,
      public.campaigns_norm_email(c.email) AS ne
    FROM public.customers c
    WHERE c.deleted_at IS NULL
      AND (nullif(f->>'status','')  IS NULL OR f->>'status'  = 'todos' OR c.status = f->>'status')
      AND (nullif(f->>'gender','')  IS NULL OR f->>'gender'  = 'todos' OR c.gender = f->>'gender')
      AND (nullif(f->>'country','') IS NULL OR c.country ILIKE '%'||(f->>'country')||'%')
      AND (nullif(f->>'state','')   IS NULL OR c.state   ILIKE '%'||(f->>'state')||'%')
      AND (nullif(f->>'city','')    IS NULL OR c.city    ILIKE '%'||(f->>'city')||'%')
      AND (nullif(f->>'origin','')  IS NULL OR f->>'origin' = 'todos' OR c.origin = f->>'origin')
      AND (prod IS NULL OR EXISTS (SELECT 1 FROM public.customer_products cp
                                    WHERE cp.customer_id = c.id AND cp.product_id = prod))
      AND (nullif(f->>'sellerId','') IS NULL OR f->>'sellerId' = 'todos'
           OR EXISTS (SELECT 1 FROM public.customer_products cp
                       WHERE cp.customer_id = c.id AND cp.owner_id = (f->>'sellerId')::uuid))
      AND (f->'tags' IS NULL OR jsonb_array_length(coalesce(f->'tags','[]'::jsonb)) = 0
           OR (SELECT array_agg(t) FROM jsonb_array_elements_text(f->'tags') t) <@ coalesce(c.tags, '{}'))
      AND (nullif(f->>'ageMin','') IS NULL OR (c.birth_date IS NOT NULL
           AND extract(year from age(c.birth_date)) >= (f->>'ageMin')::int))
      AND (nullif(f->>'ageMax','') IS NULL OR (c.birth_date IS NOT NULL
           AND extract(year from age(c.birth_date)) <= (f->>'ageMax')::int))
      AND (coalesce(f->>'birthday','todos') = 'todos' OR (c.birth_date IS NOT NULL AND (
            (f->>'birthday' = 'mes' AND extract(month from c.birth_date) = extract(month from CURRENT_DATE))
         OR (f->>'birthday' = 'hoje' AND to_char(c.birth_date,'MM-DD') = to_char(CURRENT_DATE,'MM-DD')))))
      AND (public.campaigns_can_manage(uid)
           OR EXISTS (SELECT 1 FROM public.customer_products cp
                       WHERE cp.customer_id = c.id AND public.has_product_access(uid, cp.product_id)))
  ), scored AS (
    SELECT b.id, b.name, b.np, b.ne, b.city,
      (SELECT p.name FROM public.customer_products cp JOIN public.products p ON p.id = cp.product_id
        WHERE cp.customer_id = b.id ORDER BY cp.created_at LIMIT 1) AS product_name,
      (SELECT pr.full_name FROM public.customer_products cp JOIN public.profiles pr ON pr.id = cp.owner_id
        WHERE cp.customer_id = b.id ORDER BY cp.created_at LIMIT 1) AS seller_name,
      ARRAY(
        SELECT ch FROM unnest(p_channels) ch
        WHERE (ch = 'email' AND b.ne IS NOT NULL) OR (ch <> 'email' AND b.np IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM public.message_consents mc
                           WHERE mc.customer_id = b.id AND mc.channel = ch AND mc.status = 'opt_out')
          AND NOT EXISTS (SELECT 1 FROM public.message_suppression ms
                           WHERE ms.channel = ch
                             AND ms.address = CASE WHEN ch = 'email' THEN b.ne ELSE b.np END)
      ) AS ok_channels
    FROM base b
  )
  SELECT s.id, s.name, s.np, s.ne, s.city, s.product_name, s.seller_name, s.ok_channels,
         CASE WHEN array_length(s.ok_channels,1) IS NULL
              THEN 'Sem contato válido ou sem consentimento' ELSE NULL END
  FROM scored s
  ORDER BY s.name
  LIMIT greatest(1, least(coalesce(p_limit,200), 1000)) OFFSET greatest(0, coalesce(p_offset,0));
END $$;

-- Criação transacional da campanha
CREATE OR REPLACE FUNCTION public.campaigns_create(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  prod uuid := nullif(p->>'product_id','')::uuid;
  chans text[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'channels','[]'::jsonb)));
  camp_id uuid;
  wf_id uuid;
  st jsonb;
  step_id uuid;
  rec record;
  ch text;
  total int := 0;
  base_time timestamptz := coalesce(nullif(p->>'scheduled_at','')::timestamptz, now());
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.campaigns_scope(uid, prod) THEN
    RAISE EXCEPTION 'Sem permissão para criar campanha nesta categoria.';
  END IF;
  IF length(btrim(coalesce(p->>'name',''))) < 3 THEN RAISE EXCEPTION 'Informe o nome da campanha.'; END IF;
  IF array_length(chans,1) IS NULL THEN RAISE EXCEPTION 'Escolha pelo menos um canal.'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(chans) c WHERE c NOT IN ('whatsapp','email','sms')) THEN
    RAISE EXCEPTION 'Canal inválido.';
  END IF;
  IF length(coalesce(p->>'body','')) < 1 OR length(coalesce(p->>'body','')) > 4000 THEN
    RAISE EXCEPTION 'O texto da mensagem precisa ter entre 1 e 4000 caracteres.';
  END IF;

  INSERT INTO public.campaigns(name, objective, channels, fallback_channel, product_id, segment_id,
    filters, sender, subject, body, link, attachments, occasion, recurring, scheduled_at, timezone,
    quiet_start, quiet_end, status, created_by)
  VALUES (btrim(p->>'name'), nullif(p->>'objective',''), chans, nullif(p->>'fallback_channel',''),
    prod, nullif(p->>'segment_id','')::uuid, coalesce(p->'filters','{}'::jsonb), nullif(p->>'sender',''),
    nullif(p->>'subject',''), p->>'body', nullif(p->>'link',''), coalesce(p->'attachments','[]'::jsonb),
    coalesce(nullif(p->>'occasion',''),'pontual'), coalesce((p->>'recurring')::boolean,false),
    nullif(p->>'scheduled_at','')::timestamptz, coalesce(nullif(p->>'timezone',''),'America/Sao_Paulo'),
    coalesce(nullif(p->>'quiet_start','')::time, '21:00'), coalesce(nullif(p->>'quiet_end','')::time, '08:00'),
    'rascunho', uid)
  RETURNING id INTO camp_id;

  INSERT INTO public.campaign_workflows(campaign_id, name, trigger_type, trigger_date, recurrence, is_active)
  VALUES (camp_id, btrim(p->>'name'), coalesce(nullif(p->>'occasion',''),'pontual'),
          nullif(p->>'trigger_date','')::date, nullif(p->>'recurrence',''),
          coalesce((p->>'recurring')::boolean,false))
  RETURNING id INTO wf_id;

  FOR st IN SELECT * FROM jsonb_array_elements(
      CASE WHEN jsonb_array_length(coalesce(p->'steps','[]'::jsonb)) > 0 THEN p->'steps'
           ELSE jsonb_build_array(jsonb_build_object('position',1,'channel',chans[1],
                'fallback_channel', p->>'fallback_channel','subject', p->>'subject',
                'body', p->>'body','wait_minutes',0)) END) LOOP
    INSERT INTO public.campaign_steps(workflow_id, position, channel, fallback_channel, template_id,
      subject, body, wait_minutes)
    VALUES (wf_id, coalesce((st->>'position')::int,1), st->>'channel', nullif(st->>'fallback_channel',''),
      nullif(st->>'template_id','')::uuid, nullif(st->>'subject',''), coalesce(st->>'body', p->>'body'),
      greatest(0, coalesce((st->>'wait_minutes')::int,0)));
  END LOOP;

  SELECT id INTO step_id FROM public.campaign_steps WHERE workflow_id = wf_id ORDER BY position LIMIT 1;

  FOR rec IN
    SELECT * FROM public.campaigns_audience(coalesce(p->'filters','{}'::jsonb), chans, 1000, 0)
  LOOP
    INSERT INTO public.campaign_recipients(campaign_id, customer_id, name, phone, email, status, blocked_reason)
    VALUES (camp_id, rec.customer_id, rec.name, rec.phone, rec.email,
            CASE WHEN rec.blocked_reason IS NULL THEN 'na_fila' ELSE 'bloqueado' END, rec.blocked_reason);

    IF rec.blocked_reason IS NULL THEN
      FOREACH ch IN ARRAY rec.channels LOOP
        INSERT INTO public.message_jobs(campaign_id, recipient_id, step_id, step_no, channel, to_address,
          subject, body, media_url, media_path, media_mime, template_name, template_lang,
          idempotency_key, status, scheduled_for)
        SELECT camp_id, r.id, step_id, 1, ch,
          CASE WHEN ch = 'email' THEN rec.email ELSE rec.phone END,
          nullif(p->>'subject',''),
          replace(replace(replace(p->>'body','{{nome}}', coalesce(rec.name,'')),
            '{{primeiro_nome}}', coalesce(split_part(rec.name,' ',1),'')),
            '{{produto}}', coalesce(rec.product_name,'')),
          nullif(p->>'media_url',''), nullif(p->>'media_path',''), nullif(p->>'media_mime',''),
          nullif(p->>'template_name',''), nullif(p->>'template_lang',''),
          camp_id::text || ':' || rec.customer_id::text || ':' || ch || ':1',
          'na_fila', base_time
        FROM public.campaign_recipients r
        WHERE r.campaign_id = camp_id AND r.customer_id = rec.customer_id
        ON CONFLICT (idempotency_key) DO NOTHING;
        total := total + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('id', camp_id, 'workflow_id', wf_id, 'jobs', total);
END $$;

-- Máquina de estados
CREATE OR REPLACE FUNCTION public.campaigns_set_status(p_campaign_id uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  c record;
  allowed text[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campanha não encontrada.'; END IF;
  IF NOT public.campaigns_can_manage(uid) THEN
    RAISE EXCEPTION 'Somente administradores e gestores mudam o status da campanha.';
  END IF;

  allowed := CASE c.status
    WHEN 'rascunho' THEN ARRAY['aguardando_aprovacao','cancelada']
    WHEN 'aguardando_aprovacao' THEN ARRAY['agendada','rascunho','cancelada']
    WHEN 'agendada' THEN ARRAY['executando','pausada','cancelada']
    WHEN 'executando' THEN ARRAY['pausada','concluida','cancelada']
    WHEN 'pausada' THEN ARRAY['executando','cancelada']
    ELSE ARRAY[]::text[] END;

  IF c.status = p_status THEN RETURN jsonb_build_object('id', c.id, 'status', c.status); END IF;
  IF NOT (p_status = ANY(allowed)) THEN
    RAISE EXCEPTION 'Não é possível mudar de % para %.', c.status, p_status;
  END IF;
  IF p_status = 'cancelada' AND length(btrim(coalesce(p_reason,''))) < 5 THEN
    RAISE EXCEPTION 'Descreva o motivo do cancelamento.';
  END IF;

  PERFORM set_config('app.campaign_status', '1', true);
  UPDATE public.campaigns SET
    status = p_status,
    approved_by = CASE WHEN p_status = 'agendada' THEN uid ELSE approved_by END,
    approved_at = CASE WHEN p_status = 'agendada' THEN now() ELSE approved_at END,
    cancel_reason = CASE WHEN p_status = 'cancelada' THEN p_reason ELSE cancel_reason END
  WHERE id = p_campaign_id;
  PERFORM set_config('app.campaign_status', '0', true);

  IF p_status IN ('cancelada','pausada') THEN
    UPDATE public.message_jobs SET status = 'cancelado'
      WHERE campaign_id = p_campaign_id AND status IN ('na_fila','falhou')
        AND p_status = 'cancelada';
  END IF;

  RETURN jsonb_build_object('id', p_campaign_id, 'status', p_status);
END $$;

-- Reserva atômica de lote com revalidação
CREATE OR REPLACE FUNCTION public.campaigns_claim_jobs(p_campaign_id uuid, p_limit integer, p_worker text)
RETURNS SETOF public.message_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  lim integer := greatest(1, least(coalesce(p_limit, 50), 100));
  j record;
BEGIN
  IF uid IS NULL OR NOT public.campaigns_can_manage(uid) THEN
    RAISE EXCEPTION 'Sem permissão para disparar campanhas.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campaigns WHERE id = p_campaign_id
                  AND status IN ('agendada','executando')) THEN
    RAISE EXCEPTION 'A campanha precisa estar agendada ou executando.';
  END IF;

  FOR j IN
    SELECT m.* FROM public.message_jobs m
    WHERE m.campaign_id = p_campaign_id
      AND m.status IN ('na_fila','falhou')
      AND m.scheduled_for <= now()
      AND (m.next_attempt_at IS NULL OR m.next_attempt_at <= now())
      AND (m.lease_until IS NULL OR m.lease_until < now())
    ORDER BY m.scheduled_for
    LIMIT lim
    FOR UPDATE SKIP LOCKED
  LOOP
    -- revalidação imediatamente antes do envio
    IF EXISTS (SELECT 1 FROM public.message_suppression s
                WHERE s.channel = j.channel AND s.address = j.to_address)
       OR EXISTS (SELECT 1 FROM public.campaign_recipients r
                  JOIN public.message_consents mc ON mc.customer_id = r.customer_id
                  WHERE r.id = j.recipient_id AND mc.channel = j.channel AND mc.status = 'opt_out')
       OR j.to_address IS NULL THEN
      UPDATE public.message_jobs
        SET status = 'bloqueado', error = 'Consentimento revogado ou contato suprimido',
            lease_until = NULL
        WHERE id = j.id;
      CONTINUE;
    END IF;

    UPDATE public.message_jobs
      SET status = 'processando', lease_until = now() + interval '5 minutes', locked_by = p_worker
      WHERE id = j.id
      RETURNING * INTO j;
    RETURN NEXT j;
  END LOOP;
END $$;

-- Conclusão do envio (sucesso exige identificador do provedor)
CREATE OR REPLACE FUNCTION public.campaigns_finish_job(
  p_job_id uuid, p_ok boolean, p_provider text, p_message_id text,
  p_error text, p_max_attempts integer DEFAULT 5)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  j record;
  n integer;
  give_up boolean;
BEGIN
  IF uid IS NULL OR NOT public.campaigns_can_manage(uid) THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  SELECT * INTO j FROM public.message_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Envio não encontrado.'; END IF;
  n := coalesce(j.attempts, 0) + 1;

  INSERT INTO public.message_attempts(job_id, attempt_no, status, error)
  VALUES (p_job_id, n, CASE WHEN p_ok THEN 'enviado' ELSE 'falhou' END,
          CASE WHEN p_ok THEN NULL ELSE p_error END);

  IF p_ok AND coalesce(btrim(p_message_id),'') = '' THEN
    p_ok := false;
    p_error := 'Provedor não devolveu identificador da mensagem.';
  END IF;

  IF p_ok THEN
    UPDATE public.message_jobs SET status = 'enviado', attempts = n, provider = p_provider,
      provider_message_id = p_message_id, sent_at = now(), error = NULL,
      next_attempt_at = NULL, lease_until = NULL, locked_by = NULL
      WHERE id = p_job_id;
    UPDATE public.campaign_recipients SET status = 'enviado' WHERE id = j.recipient_id;
  ELSE
    give_up := n >= greatest(1, coalesce(p_max_attempts,5));
    UPDATE public.message_jobs SET status = 'falhou', attempts = n, error = p_error,
      lease_until = NULL, locked_by = NULL,
      next_attempt_at = CASE WHEN give_up THEN NULL
                             ELSE now() + (least(60, power(2, n))::text || ' minutes')::interval END
      WHERE id = p_job_id;
    IF give_up AND j.recipient_id IS NOT NULL THEN
      UPDATE public.campaign_recipients SET status = 'falhou' WHERE id = j.recipient_id;
    END IF;
  END IF;
END $$;

-- Permissões de execução
REVOKE ALL ON FUNCTION public.campaigns_audience(jsonb, text[], integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.campaigns_create(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.campaigns_set_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.campaigns_claim_jobs(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.campaigns_finish_job(uuid, boolean, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaigns_audience(jsonb, text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaigns_create(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaigns_set_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaigns_claim_jobs(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaigns_finish_job(uuid, boolean, text, text, text, integer) TO authenticated;

-- Funções internas não devem ser chamáveis pelo aplicativo
REVOKE ALL ON FUNCTION public.campaigns_guard_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_default_pipeline() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_apply_stock(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_next_number(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_create_preorder(text, text, jsonb, jsonb, text, jsonb) FROM PUBLIC;