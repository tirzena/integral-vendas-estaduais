
CREATE TABLE IF NOT EXISTS public.tracking_view_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.delivery_tracking_sessions(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  ended_at timestamptz,
  end_reason text
);
GRANT SELECT ON public.tracking_view_sessions TO authenticated;
GRANT ALL ON public.tracking_view_sessions TO service_role;
ALTER TABLE public.tracking_view_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tvs_read_own ON public.tracking_view_sessions FOR SELECT TO authenticated
  USING (admin_id = auth.uid() AND public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS tvs_admin_idx ON public.tracking_view_sessions(admin_id, ended_at);

CREATE TABLE IF NOT EXISTS public.tracking_webhook_events (
  event_id text PRIMARY KEY,
  provider text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tracking_webhook_events TO service_role;
ALTER TABLE public.tracking_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY twe_none ON public.tracking_webhook_events FOR SELECT TO authenticated USING (false);

-- posições deixam de ser legíveis pelo Data API
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='tracking_positions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tracking_positions', p.policyname);
  END LOOP;
END $$;
REVOKE ALL ON public.tracking_positions FROM authenticated, anon;
GRANT ALL ON public.tracking_positions TO service_role;
CREATE POLICY tracking_positions_none ON public.tracking_positions FOR SELECT TO authenticated USING (false);

DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.tracking_positions';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- abertura da sessão de visualização (exige AAL2)
CREATE OR REPLACE FUNCTION public.tracking_open_view(_order_id uuid, _session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); v_id uuid; aal text;
BEGIN
  IF uid IS NULL OR NOT public.is_admin(uid) THEN
    RAISE EXCEPTION 'Somente administradores podem ver coordenadas.';
  END IF;
  aal := coalesce(auth.jwt()->>'aal', 'aal1');
  IF aal <> 'aal2' THEN
    RAISE EXCEPTION 'Ative a verificação em duas etapas para ver a localização exata.';
  END IF;
  UPDATE public.tracking_view_sessions
     SET ended_at = now(), end_reason = 'substituida'
   WHERE admin_id = uid AND ended_at IS NULL;
  INSERT INTO public.tracking_view_sessions(admin_id, order_id, session_id)
  VALUES (uid, _order_id, _session_id) RETURNING id INTO v_id;
  PERFORM public.tracking_log_view(_order_id, 'mapa_aberto');
  RETURN jsonb_build_object('view_id', v_id, 'expires_at', now() + interval '15 minutes');
END $$;
REVOKE EXECUTE ON FUNCTION public.tracking_open_view(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tracking_open_view(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tracking_close_view(_view_id uuid, _reason text DEFAULT 'fechado')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.tracking_view_sessions WHERE id = _view_id AND admin_id = auth.uid();
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.tracking_view_sessions SET ended_at = now(), end_reason = left(coalesce(_reason,'fechado'),40)
   WHERE id = _view_id AND ended_at IS NULL;
  IF v.order_id IS NOT NULL THEN PERFORM public.tracking_log_view(v.order_id, 'mapa_fechado'); END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.tracking_close_view(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tracking_close_view(uuid, text) TO authenticated;

-- leitura de posições: só com sessão de visualização válida do próprio admin
CREATE OR REPLACE FUNCTION public.tracking_read_positions(_view_id uuid, _session_id uuid, _limit integer DEFAULT 30)
RETURNS TABLE(id uuid, latitude double precision, longitude double precision,
              accuracy_m double precision, speed_kmh double precision,
              heading_deg double precision, device_time timestamptz, received_at timestamptz, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); v record;
BEGIN
  IF uid IS NULL OR NOT public.is_admin(uid) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT * INTO v FROM public.tracking_view_sessions
   WHERE id = _view_id AND admin_id = uid AND ended_at IS NULL
     AND expires_at > now() AND last_seen_at > now() - interval '5 minutes';
  IF NOT FOUND THEN RAISE EXCEPTION 'Visualização encerrada. Abra o mapa novamente.'; END IF;
  IF v.session_id IS DISTINCT FROM _session_id THEN RAISE EXCEPTION 'Visualização não corresponde à entrega.'; END IF;

  UPDATE public.tracking_view_sessions SET last_seen_at = now() WHERE id = _view_id;

  RETURN QUERY
  SELECT p.id, p.latitude, p.longitude, p.accuracy_m, p.speed_kmh, p.heading_deg,
         p.device_time, p.received_at, p.source
  FROM public.tracking_positions p
  WHERE p.session_id = _session_id
  ORDER BY p.device_time DESC
  LIMIT greatest(1, least(coalesce(_limit,30), 200));
END $$;
REVOKE EXECUTE ON FUNCTION public.tracking_read_positions(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tracking_read_positions(uuid, uuid, integer) TO authenticated;

-- encerramento automático quando a entrega termina
CREATE OR REPLACE FUNCTION public.tracking_close_on_order_end()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado')
     OR (NEW.delivered_at IS NOT NULL AND OLD.delivered_at IS NULL) THEN
    UPDATE public.delivery_tracking_sessions
       SET status = 'encerrado', ended_at = now(), end_reason = 'entrega_finalizada'
     WHERE order_id = NEW.id AND ended_at IS NULL;
    UPDATE public.tracking_view_sessions
       SET ended_at = now(), end_reason = 'entrega_finalizada'
     WHERE order_id = NEW.id AND ended_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_tracking_close_on_order_end ON public.orders;
CREATE TRIGGER trg_tracking_close_on_order_end AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tracking_close_on_order_end();
