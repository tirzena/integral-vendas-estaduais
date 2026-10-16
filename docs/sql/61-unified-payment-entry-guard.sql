DO $patch$
DECLARE signature text; d text; p integer; rule text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.sales_payment_received(jsonb,boolean)','public.sales_payment_received_manual(jsonb,jsonb)','public.sales_register_payment(uuid,numeric,text,uuid)'] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO d;
  IF strpos(d,'Use o botão Lançar pagamento')=0 THEN
   rule:=CASE WHEN signature='public.sales_payment_received(jsonb,boolean)' THEN
    ' IF coalesce((SELECT workflow_enabled FROM private.remuneration_settings),false) AND NOT coalesce(p_edit,false) THEN RAISE EXCEPTION ''Use o botão Lançar pagamento para enviar o recebimento à aprovação financeira.''; END IF;
 IF coalesce(p_edit,false) AND NOT private.integral_can_review_financial(auth.uid()) THEN RAISE EXCEPTION ''Ajustes financeiros restritos aos responsáveis autorizados.'' USING ERRCODE=''42501''; END IF;'
   ELSE ' IF coalesce((SELECT workflow_enabled FROM private.remuneration_settings),false) THEN RAISE EXCEPTION ''Use o botão Lançar pagamento para enviar o recebimento à aprovação financeira.''; END IF;' END;
   p:=strpos(d,'BEGIN');
   IF p=0 THEN RAISE EXCEPTION 'Legacy payment function does not match baseline'; END IF;
   d:=substr(d,1,p-1)||'BEGIN'||E'\n'||rule||E'\n'||substr(d,p+5);
   EXECUTE d;
  END IF;
 END LOOP;
END $patch$;