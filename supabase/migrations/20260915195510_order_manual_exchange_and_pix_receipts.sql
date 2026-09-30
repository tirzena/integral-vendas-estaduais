-- Receipt amount is separate from the amount credited in the order currency.
-- Existing payment amounts and all historical balances remain unchanged.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS received_amount numeric,
 ADD COLUMN IF NOT EXISTS received_currency public.currency_code;
CREATE OR REPLACE FUNCTION public.sales_with_order_exchange(p_rpc text,p_args jsonb,p_exchange jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE signature record; argument text; clauses text[]:='{}'; result jsonb; rate numeric; base text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NÃ£o autenticado.'; END IF;
 IF p_rpc NOT IN ('sales_create_document','sales_create_document_v2','sales_replace_order_version') THEN RAISE EXCEPTION 'OperaÃ§Ã£o invÃ¡lida.'; END IF;
 base:=p_args->>'p_currency';
 IF base NOT IN ('USD','BRL','PYG') OR p_exchange->>'base' IS DISTINCT FROM base
 OR coalesce(p_exchange->>'mode','') NOT IN ('manual','automatic') THEN RAISE EXCEPTION 'CotaÃ§Ã£o invÃ¡lida.'; END IF;
 FOREACH argument IN ARRAY ARRAY['USD','BRL','PYG'] LOOP
  rate:=(p_exchange->>argument)::numeric;
  IF rate IS NULL OR rate<=0 OR rate::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'A cotaÃ§Ã£o deve ser maior que zero.'; END IF;
 END LOOP;
 IF abs((p_exchange->>base)::numeric-1)>0.00000001 THEN RAISE EXCEPTION 'Moeda base invÃ¡lida.'; END IF;
 FOR signature IN SELECT p.proargnames,p.proargtypes,p.pronargs FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=p_rpc LOOP
  clauses:='{}';
  FOR i IN 1..signature.pronargs LOOP
   argument:=signature.proargnames[i];
   IF NOT p_args ? argument THEN RAISE EXCEPTION 'Argumento ausente: %',argument; END IF;
   IF pg_catalog.format_type(signature.proargtypes[i-1],NULL)='jsonb' THEN
    clauses:=array_append(clauses,format('%I => nullif($1->%L,''null''::jsonb)',argument,argument));
   ELSE
    clauses:=array_append(clauses,format('%I => ($1->>%L)::%s',argument,argument,pg_catalog.format_type(signature.proargtypes[i-1],NULL)));
   END IF;
  END LOOP;
 END LOOP;
 IF array_length(clauses,1) IS NULL THEN RAISE EXCEPTION 'OperaÃ§Ã£o indisponÃ­vel.'; END IF;
 PERFORM set_config('os.order_exchange',p_exchange::text,true);
 PERFORM set_config('os.created_payments',coalesce(p_args->'p_payments','[]'::jsonb)::text,true);
 PERFORM set_config('os.created_payment_index','0',true);
 PERFORM set_config('os.creating_order_id','',true);
 EXECUTE format('select public.%I(%s)',p_rpc,array_to_string(clauses,',')) INTO result USING p_args;
 PERFORM set_config('os.order_exchange','',true);
 PERFORM set_config('os.created_payments','',true);
 PERFORM set_config('os.creating_order_id','',true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.sales_with_order_exchange(text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_with_order_exchange(text,jsonb,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.apply_order_exchange_override() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb:=nullif(current_setting('os.order_exchange',true),'')::jsonb;
BEGIN
 IF snapshot IS NOT NULL AND snapshot->>'base'=NEW.currency::text THEN
  PERFORM set_config('os.creating_order_id',NEW.id::text,true);
  NEW.exchange_rates_snapshot:=snapshot;
  NEW.exchange_rate_source:=CASE WHEN snapshot->>'mode'='manual' THEN 'CotaÃ§Ã£o manual do pedido' ELSE 'CotaÃ§Ã£o automÃ¡tica do pedido' END;
  NEW.exchange_rate_locked_at:=now();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apply_order_exchange_override() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a_order_exchange_override BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.apply_order_exchange_override();
CREATE OR REPLACE FUNCTION public.capture_payment_received_currency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; rate numeric; input_payment jsonb; payment_index integer; original jsonb:=nullif(current_setting('os.payment_received',true),'')::jsonb;
BEGIN
 IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.amount IS NOT DISTINCT FROM OLD.amount AND NEW.method IS NOT DISTINCT FROM OLD.method THEN RETURN NEW; END IF;
 SELECT exchange_rates_snapshot INTO snapshot FROM public.orders WHERE id=NEW.order_id;
 IF NEW.currency::text IS DISTINCT FROM snapshot->>'base' THEN snapshot:=NULL; END IF;
 IF TG_OP='INSERT' AND NEW.order_id::text=nullif(current_setting('os.creating_order_id',true),'') THEN
  payment_index:=coalesce(nullif(current_setting('os.created_payment_index',true),''),'0')::integer;
  input_payment:=nullif(current_setting('os.created_payments',true),'')::jsonb->payment_index;
  PERFORM set_config('os.created_payment_index',(payment_index+1)::text,true);
  IF input_payment->>'received_currency'='BRL' AND lower(btrim(coalesce(NEW.method,'')))='pix' THEN
   IF round((input_payment->>'amount')::numeric,2) IS DISTINCT FROM NEW.amount THEN RAISE EXCEPTION 'Valor do pagamento inconsistente.'; END IF;
   original:=jsonb_build_object('amount',(input_payment->>'received_amount')::numeric);
  END IF;
 END IF;
 IF lower(btrim(coalesce(NEW.method,'')))='pix' THEN
  rate:=(snapshot->>'BRL')::numeric;
  IF rate IS NULL THEN SELECT r.rate INTO rate FROM public.financial_rate_at(NEW.currency,'BRL',now()) r LIMIT 1; END IF;
  IF rate IS NULL OR rate<=0 THEN RAISE EXCEPTION 'CotaÃ§Ã£o para Pix indisponÃ­vel.'; END IF;
  IF (original->>'amount')::numeric IS NOT NULL AND abs(round((original->>'amount')::numeric/rate,2)-NEW.amount)>0.01 THEN RAISE EXCEPTION 'O valor Pix não corresponde à cotação do pedido.'; END IF;
  NEW.received_currency:='BRL';
  NEW.received_amount:=coalesce((original->>'amount')::numeric,round(NEW.amount*rate,2));
 ELSE
  NEW.received_currency:=NEW.currency; NEW.received_amount:=NEW.amount;
 END IF;
 IF snapshot IS NOT NULL THEN
  NEW.exchange_rates_snapshot:=snapshot;
  NEW.exchange_rate_source:=(SELECT exchange_rate_source FROM public.orders WHERE id=NEW.order_id);
  NEW.exchange_rate_locked_at:=now();
  NEW.settled_amount_brl:=CASE WHEN NEW.received_currency='BRL' THEN NEW.received_amount ELSE round(NEW.amount*(snapshot->>'BRL')::numeric,4) END;
  NEW.settled_amount_usd:=round(NEW.amount*(snapshot->>'USD')::numeric,4);
  NEW.settled_amount_pyg:=round(NEW.amount*(snapshot->>'PYG')::numeric,4);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_payment_received_currency() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a_payment_received_currency BEFORE INSERT OR UPDATE OF amount,method ON public.payments FOR EACH ROW EXECUTE FUNCTION public.capture_payment_received_currency();
CREATE OR REPLACE FUNCTION public.sales_payment_received(p_args jsonb,p_edit boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; amount numeric:=(p_args->>'amount')::numeric; credited numeric; rate numeric; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NÃ£o autenticado.'; END IF;
 IF amount IS NULL OR amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Informe um valor de pagamento maior que zero.'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=(p_args->>'order_id')::uuid FOR UPDATE;
 IF o.id IS NULL OR NOT public.sales_can_manage(auth.uid(),o.seller_id) THEN RAISE EXCEPTION 'Sem permissÃ£o para este pedido.'; END IF;
 credited:=amount;
 IF lower(btrim(coalesce(p_args->>'method','')))='pix' THEN
  rate:=(o.exchange_rates_snapshot->>'BRL')::numeric;
  IF rate IS NULL THEN SELECT r.rate INTO rate FROM public.financial_rate_at(o.currency,'BRL',now()) r LIMIT 1; END IF;
  IF rate IS NULL OR rate<=0 THEN RAISE EXCEPTION 'CotaÃ§Ã£o para Pix indisponÃ­vel.'; END IF;
  credited:=round(amount/rate,2);
  PERFORM set_config('os.payment_received',jsonb_build_object('amount',amount,'currency','BRL')::text,true);
 END IF;
 IF p_edit THEN
  result:=public.sales_edit_order_payment(o.id,(p_args->>'payment_id')::uuid,credited,p_args->>'method',(p_args->>'proof_id')::uuid,p_args->>'reason');
 ELSE
  result:=public.sales_register_payment(o.id,credited,p_args->>'method',(p_args->>'proof_id')::uuid);
 END IF;
 PERFORM set_config('os.payment_received','',true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.sales_payment_received(jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_payment_received(jsonb,boolean) TO authenticated;
