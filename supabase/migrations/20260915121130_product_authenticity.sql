-- No public access to box secrets. Public queries pass through the server.
CREATE TABLE public.authenticity_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 purchase_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
 lot_number text NOT NULL CHECK(length(lot_number) BETWEEN 1 AND 80),
 product_name text NOT NULL,
 manufacture_date date NOT NULL,
 expiry_date date NOT NULL CHECK(expiry_date > manufacture_date),
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 50000),
 active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(item_id,lot_number)
);
CREATE INDEX ON public.authenticity_batches(purchase_item_id);
CREATE TABLE public.authenticity_boxes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES public.authenticity_batches(id) ON DELETE RESTRICT,
 serial integer NOT NULL,
 code_hash text NOT NULL UNIQUE CHECK(length(code_hash)=64),
 print_code text NOT NULL UNIQUE CHECK(length(print_code)=32),
 first_validated_at timestamptz,
 UNIQUE(batch_id,serial)
);
CREATE INDEX ON public.authenticity_boxes(batch_id);
CREATE TABLE public.authenticity_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 batch_id uuid REFERENCES public.authenticity_batches(id),
 result text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.authenticity_limits (
 bucket text PRIMARY KEY,
 window_start timestamptz NOT NULL,
 attempts integer NOT NULL
);
ALTER TABLE public.authenticity_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authenticity_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authenticity_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authenticity_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.authenticity_batches,public.authenticity_boxes,public.authenticity_attempts,public.authenticity_limits FROM anon,authenticated;
GRANT ALL ON public.authenticity_batches,public.authenticity_boxes,public.authenticity_attempts,public.authenticity_limits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.authenticity_attempts_id_seq TO service_role;
-- Service-role RPCs are invoker functions, never callable by a browser.
CREATE FUNCTION public.authenticity_create_batch(p_item uuid,p_lot text,p_manufacture date,p_expiry date,p_codes jsonb,p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b uuid; line record; used integer; n integer:=jsonb_array_length(p_codes);
BEGIN
 IF p_actor IS NULL OR NOT public.is_admin(p_actor) THEN RAISE EXCEPTION 'Admin required'; END IF;
 SELECT pi.*,po.status AS purchase_status INTO line FROM public.purchase_order_items pi JOIN public.purchase_orders po ON po.id=pi.purchase_order_id WHERE pi.id=p_item FOR UPDATE OF pi;
 IF NOT FOUND OR NOT line.active OR line.purchase_status='cancelada' THEN RAISE EXCEPTION 'Inactive purchase'; END IF;
 SELECT COALESCE(sum(quantity),0) INTO used FROM public.authenticity_batches WHERE purchase_item_id=p_item;
 IF n<1 OR n>50000 OR used+n>floor(line.quantity) THEN RAISE EXCEPTION 'Quantity exceeds purchase units'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_codes) c WHERE (c->>'code') !~ '^[A-F0-9]{32}$' OR (c->>'hash') !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'Invalid code'; END IF;
 INSERT INTO public.authenticity_batches(purchase_item_id,item_id,lot_number,product_name,manufacture_date,expiry_date,quantity,created_by)
 VALUES(p_item,line.item_id,p_lot,line.description,p_manufacture,p_expiry,n,p_actor) RETURNING id INTO b;
 INSERT INTO public.authenticity_boxes(batch_id,serial,code_hash,print_code)
 SELECT b,ordinality::integer,c->>'hash',c->>'code' FROM jsonb_array_elements(p_codes) WITH ORDINALITY AS x(c,ordinality);
 RETURN b;
END $$;
CREATE FUNCTION public.authenticity_validate(p_batch uuid,p_hash text,p_bucket text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE n integer; box record; stamp timestamptz; result text;
BEGIN
 INSERT INTO public.authenticity_limits(bucket,window_start,attempts) VALUES(p_bucket,date_trunc('minute',now()),1)
 ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN authenticity_limits.window_start=date_trunc('minute',now()) THEN authenticity_limits.attempts+1 ELSE 1 END,window_start=date_trunc('minute',now()) RETURNING attempts INTO n;
 IF n>10 THEN RETURN jsonb_build_object('status','limited'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.authenticity_batches b JOIN public.purchase_order_items pi ON pi.id=b.purchase_item_id JOIN public.purchase_orders po ON po.id=pi.purchase_order_id WHERE b.id=p_batch AND b.active AND pi.active AND po.status<>'cancelada') THEN RETURN jsonb_build_object('status','inactive'); END IF;
 SELECT * INTO box FROM public.authenticity_boxes WHERE batch_id=p_batch AND code_hash=p_hash FOR UPDATE;
 IF NOT FOUND THEN result:='not_found';
 ELSIF box.first_validated_at IS NOT NULL THEN result:='already_used'; stamp:=box.first_validated_at;
 ELSE result:='registered'; stamp:=clock_timestamp(); UPDATE public.authenticity_boxes SET first_validated_at=stamp WHERE id=box.id;
 END IF;
 INSERT INTO public.authenticity_attempts(batch_id,result) VALUES(p_batch,result);
 RETURN jsonb_build_object('status',result,'firstValidatedAt',stamp);
END $$;
REVOKE ALL ON FUNCTION public.authenticity_create_batch(uuid,text,date,date,jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.authenticity_validate(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authenticity_create_batch(uuid,text,date,date,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.authenticity_validate(uuid,text,text) TO service_role;
