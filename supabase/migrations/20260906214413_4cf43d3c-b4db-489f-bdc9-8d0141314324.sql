-- ============ ESTRUTURA ============

CREATE TABLE public.fleet_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate text NOT NULL,
  label text,
  model text,
  driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fleet_vehicles_plate_uidx ON public.fleet_vehicles (upper(plate));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_vehicles TO authenticated;
GRANT ALL ON public.fleet_vehicles TO service_role;
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_vehicles_admin_all" ON public.fleet_vehicles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "fleet_vehicles_driver_read" ON public.fleet_vehicles FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

CREATE TABLE public.tracking_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_device_id text NOT NULL,
  vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  label text,
  status text NOT NULL DEFAULT 'ativo',
  last_seen_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tracking_devices_provider_uidx
  ON public.tracking_devices (lower(provider), lower(external_device_id));
CREATE INDEX tracking_devices_vehicle_idx ON public.tracking_devices (vehicle_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_devices TO authenticated;
GRANT ALL ON public.tracking_devices TO service_role;
ALTER TABLE public.tracking_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracking_devices_admin_all" ON public.tracking_devices FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.delivery_tracking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.tracking_devices(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('tag','motorista')),
  purpose text NOT NULL DEFAULT 'Acompanhamento da entrega',
  status text NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando','aceito','compartilhando','parado','revogado','expirado')),
  consent_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz NOT NULL,
  end_reason text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_tracking_sessions_source_chk CHECK (
    (source = 'tag' AND device_id IS NOT NULL) OR (source = 'motorista' AND driver_id IS NOT NULL)
  )
);
CREATE INDEX dts_order_idx ON public.delivery_tracking_sessions (order_id, created_at DESC);
CREATE INDEX dts_vehicle_idx ON public.delivery_tracking_sessions (vehicle_id);
CREATE INDEX dts_driver_idx ON public.delivery_tracking_sessions (driver_id, status);
CREATE INDEX dts_device_idx ON public.delivery_tracking_sessions (device_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_tracking_sessions TO authenticated;
GRANT ALL ON public.delivery_tracking_sessions TO service_role;
ALTER TABLE public.delivery_tracking_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dts_admin_all" ON public.delivery_tracking_sessions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "dts_driver_read_own" ON public.delivery_tracking_sessions FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

CREATE TABLE public.tracking_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.delivery_tracking_sessions(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.tracking_devices(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('tag','motorista')),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m double precision,
  speed_kmh double precision,
  heading_deg double precision,
  device_time timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text
);
CREATE UNIQUE INDEX tracking_positions_dedupe_uidx ON public.tracking_positions (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX tracking_positions_session_idx ON public.tracking_positions (session_id, device_time DESC);
CREATE INDEX tracking_positions_order_idx ON public.tracking_positions (order_id, device_time DESC);
CREATE INDEX tracking_positions_vehicle_idx ON public.tracking_positions (vehicle_id, device_time DESC);
CREATE INDEX tracking_positions_received_idx ON public.tracking_positions (received_at);
GRANT SELECT ON public.tracking_positions TO authenticated;
GRANT ALL ON public.tracking_positions TO service_role;
ALTER TABLE public.tracking_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracking_positions_admin_read" ON public.tracking_positions FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TABLE public.tracking_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.delivery_tracking_sessions(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tracking_audit_order_idx ON public.tracking_audit (order_id, created_at DESC);
CREATE INDEX tracking_audit_actor_idx ON public.tracking_audit (actor_id, created_at DESC);
GRANT SELECT ON public.tracking_audit TO authenticated;
GRANT ALL ON public.tracking_audit TO service_role;
ALTER TABLE public.tracking_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracking_audit_admin_read" ON public.tracking_audit FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TABLE public.tracking_rate_limits (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tracking_rate_limits TO service_role;
ALTER TABLE public.tracking_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracking_rate_limits_service" ON public.tracking_rate_limits FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS tracking_retention_days integer NOT NULL DEFAULT 30;

CREATE TRIGGER fleet_vehicles_set_updated BEFORE UPDATE ON public.fleet_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tracking_devices_set_updated BEFORE UPDATE ON public.tracking_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER dts_set_updated BEFORE UPDATE ON public.delivery_tracking_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ OPERACOES VALIDADAS ============

CREATE OR REPLACE FUNCTION public.tracking_expire_sessions()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.delivery_tracking_sessions
     SET status = 'expirado', ended_at = COALESCE(ended_at, now()),
         end_reason = COALESCE(end_reason, 'sessao_expirada')
   WHERE status IN ('aguardando','aceito','compartilhando')
     AND expires_at <= now();
$$;
REVOKE ALL ON FUNCTION public.tracking_expire_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tracking_expire_sessions() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tracking_rate_hit(_key text, _max integer, _window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_hits integer;
BEGIN
  INSERT INTO public.tracking_rate_limits (bucket_key, window_start, hits, updated_at)
  VALUES (_key, now(), 1, now())
  ON CONFLICT (bucket_key) DO UPDATE
    SET hits = CASE WHEN public.tracking_rate_limits.window_start < now() - make_interval(secs => _window_seconds)
                    THEN 1 ELSE public.tracking_rate_limits.hits + 1 END,
        window_start = CASE WHEN public.tracking_rate_limits.window_start < now() - make_interval(secs => _window_seconds)
                    THEN now() ELSE public.tracking_rate_limits.window_start END,
        updated_at = now()
  RETURNING hits INTO v_hits;
  RETURN v_hits <= _max;
END;
$$;
REVOKE ALL ON FUNCTION public.tracking_rate_hit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tracking_rate_hit(text, integer, integer) TO authenticated, service_role;

-- motorista: aceitar / iniciar / parar
CREATE OR REPLACE FUNCTION public.tracking_session_action(_session_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.delivery_tracking_sessions%ROWTYPE; v_status text;
BEGIN
  PERFORM public.tracking_expire_sessions();
  SELECT * INTO s FROM public.delivery_tracking_sessions WHERE id = _session_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Sessão não encontrada.'; END IF;
  IF s.driver_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para esta sessão.';
  END IF;
  IF _action = 'aceitar' THEN
    IF s.status <> 'aguardando' THEN RAISE EXCEPTION 'Convite não está mais disponível.'; END IF;
    v_status := 'aceito';
    UPDATE public.delivery_tracking_sessions
       SET status = v_status, consent_at = now() WHERE id = s.id;
  ELSIF _action = 'iniciar' THEN
    IF s.status NOT IN ('aceito','parado') THEN RAISE EXCEPTION 'Sessão não pode ser iniciada.'; END IF;
    v_status := 'compartilhando';
    UPDATE public.delivery_tracking_sessions
       SET status = v_status, started_at = COALESCE(started_at, now()),
           consent_at = COALESCE(consent_at, now()), ended_at = NULL, end_reason = NULL
     WHERE id = s.id;
  ELSIF _action = 'parar' THEN
    IF s.status NOT IN ('compartilhando','aceito') THEN RAISE EXCEPTION 'Sessão não está ativa.'; END IF;
    v_status := 'parado';
    UPDATE public.delivery_tracking_sessions
       SET status = v_status, ended_at = now(), end_reason = COALESCE(_reason, 'parado_pelo_motorista')
     WHERE id = s.id;
  ELSIF _action = 'revogar' THEN
    IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
    v_status := 'revogado';
    UPDATE public.delivery_tracking_sessions
       SET status = v_status, ended_at = now(), end_reason = COALESCE(_reason, 'revogado_pelo_admin')
     WHERE id = s.id;
  ELSE
    RAISE EXCEPTION 'Ação inválida.';
  END IF;

  INSERT INTO public.tracking_audit (actor_id, session_id, order_id, action, details)
  VALUES (auth.uid(), s.id, s.order_id, 'sessao_' || _action,
          jsonb_build_object('status', v_status, 'source', s.source));
  RETURN jsonb_build_object('ok', true, 'status', v_status);
END;
$$;
REVOKE ALL ON FUNCTION public.tracking_session_action(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tracking_session_action(uuid, text, text) TO authenticated;

-- motorista: enviar ponto da sessão ativa
CREATE OR REPLACE FUNCTION public.tracking_push_point(
  _session_id uuid, _lat double precision, _lng double precision,
  _accuracy double precision DEFAULT NULL, _speed double precision DEFAULT NULL,
  _heading double precision DEFAULT NULL, _device_time timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.delivery_tracking_sessions%ROWTYPE;
BEGIN
  PERFORM public.tracking_expire_sessions();
  SELECT * INTO s FROM public.delivery_tracking_sessions WHERE id = _session_id;
  IF s.id IS NULL OR s.driver_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sessão indisponível.';
  END IF;
  IF s.status <> 'compartilhando' OR s.expires_at <= now() THEN
    RAISE EXCEPTION 'Compartilhamento não está ativo.';
  END IF;
  IF _lat IS NULL OR _lng IS NULL OR _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180 THEN
    RAISE EXCEPTION 'Coordenada inválida.';
  END IF;
  IF _device_time < now() - interval '10 minutes' OR _device_time > now() + interval '2 minutes' THEN
    RAISE EXCEPTION 'Horário do aparelho fora da janela aceita.';
  END IF;
  IF NOT public.tracking_rate_hit('drv:' || s.id::text, 40, 60) THEN
    RAISE EXCEPTION 'Envios em excesso. Aguarde alguns instantes.';
  END IF;

  INSERT INTO public.tracking_positions
    (session_id, order_id, vehicle_id, driver_id, source, latitude, longitude,
     accuracy_m, speed_kmh, heading_deg, device_time, dedupe_key)
  VALUES (s.id, s.order_id, s.vehicle_id, s.driver_id, 'motorista', _lat, _lng,
          _accuracy, _speed, _heading, _device_time,
          'drv:' || s.id::text || ':' || extract(epoch from _device_time)::bigint::text)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.tracking_push_point(uuid, double precision, double precision, double precision, double precision, double precision, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tracking_push_point(uuid, double precision, double precision, double precision, double precision, double precision, timestamptz) TO authenticated;

-- servidor: ingestão vinda de rastreador (tag)
CREATE OR REPLACE FUNCTION public.tracking_ingest_point(
  _provider text, _external_device_id text, _lat double precision, _lng double precision,
  _accuracy double precision, _speed double precision, _heading double precision,
  _device_time timestamptz, _dedupe text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.tracking_devices%ROWTYPE; s public.delivery_tracking_sessions%ROWTYPE;
BEGIN
  PERFORM public.tracking_expire_sessions();
  SELECT * INTO d FROM public.tracking_devices
   WHERE lower(provider) = lower(_provider)
     AND lower(external_device_id) = lower(_external_device_id);
  IF d.id IS NULL OR d.status <> 'ativo' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'dispositivo_nao_cadastrado');
  END IF;
  IF _lat IS NULL OR _lng IS NULL OR _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'coordenada_invalida');
  END IF;
  IF _device_time < now() - interval '1 day' OR _device_time > now() + interval '5 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'horario_invalido');
  END IF;

  SELECT * INTO s FROM public.delivery_tracking_sessions
   WHERE device_id = d.id AND status IN ('aceito','compartilhando') AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.tracking_positions
    (session_id, order_id, vehicle_id, device_id, source, latitude, longitude,
     accuracy_m, speed_kmh, heading_deg, device_time, dedupe_key)
  VALUES (s.id, s.order_id, COALESCE(s.vehicle_id, d.vehicle_id), d.id, 'tag', _lat, _lng,
          _accuracy, _speed, _heading, _device_time, _dedupe)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  UPDATE public.tracking_devices SET last_seen_at = now() WHERE id = d.id;
  RETURN jsonb_build_object('ok', true, 'linked', s.id IS NOT NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.tracking_ingest_point(text, text, double precision, double precision, double precision, double precision, double precision, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tracking_ingest_point(text, text, double precision, double precision, double precision, double precision, double precision, timestamptz, text) TO service_role;

-- retenção
CREATE OR REPLACE FUNCTION public.tracking_purge_points(_days integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_days integer; v_count integer;
BEGIN
  SELECT COALESCE(_days, (SELECT tracking_retention_days FROM public.company_settings LIMIT 1), 30) INTO v_days;
  DELETE FROM public.tracking_positions WHERE received_at < now() - make_interval(days => v_days);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.tracking_purge_points(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tracking_purge_points(integer) TO service_role;

-- auditoria de abertura/fechamento do mapa (somente admin)
CREATE OR REPLACE FUNCTION public.tracking_log_view(_order_id uuid, _action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF _action NOT IN ('mapa_aberto','mapa_fechado') THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
  INSERT INTO public.tracking_audit (actor_id, order_id, action, details)
  VALUES (auth.uid(), _order_id, _action, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.tracking_log_view(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tracking_log_view(uuid, text) TO authenticated;