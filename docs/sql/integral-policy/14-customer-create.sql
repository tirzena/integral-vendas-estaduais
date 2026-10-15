CREATE FUNCTION public.integral_seller_create_customer(p_name text,p_phone text DEFAULT NULL,p_email text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor uuid:=private.seller_require_actor(); customer uuid; context_id uuid:=gen_random_uuid();
BEGIN
 IF NOT private.integral_operation_allowed(actor,'customers.create') THEN RAISE EXCEPTION 'Criação de clientes não concedida.' USING ERRCODE='42501'; END IF;
 p_name:=btrim(coalesce(p_name,''));
 IF length(p_name) NOT BETWEEN 1 AND 150 OR length(coalesce(p_phone,''))>80 OR length(coalesce(p_email,''))>254 THEN RAISE EXCEPTION 'Dados do cliente inválidos.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('customer:'||actor::text||':'||lower(p_name)||':'||coalesce(p_phone,''),0));
 SELECT c.id INTO customer FROM public.customers c WHERE c.created_by=actor AND c.deleted_at IS NULL AND lower(btrim(c.name))=lower(p_name) AND coalesce(c.phone,'')=coalesce(p_phone,'') ORDER BY c.created_at LIMIT 1;
 IF customer IS NOT NULL THEN RETURN customer; END IF;
 INSERT INTO private.seller_creation_context VALUES(pg_backend_pid(),txid_current(),actor,context_id,'create_sale');
 INSERT INTO public.customers(name,phone,whatsapp,email,created_by,origin) VALUES(p_name,nullif(p_phone,''),nullif(p_phone,''),nullif(p_email,''),actor,'Sistema Integral') RETURNING id INTO customer;
 DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=actor;
 RETURN customer;
END $$;
REVOKE ALL ON FUNCTION public.integral_seller_create_customer(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_seller_create_customer(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.estadual_seller_create_customer(p_name text,p_phone text DEFAULT NULL,p_email text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.seller_require_actor();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.integral_division_access a WHERE a.user_id=actor AND a.system_code='vendas_estaduais' AND a.can_write) THEN RAISE EXCEPTION 'Acesso de escrita ao Estadual necessário.' USING ERRCODE='42501'; END IF;
 RETURN public.integral_seller_create_customer(p_name,p_phone,p_email);
END $$;
REVOKE ALL ON FUNCTION public.estadual_seller_create_customer(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.estadual_seller_create_customer(text,text,text) TO authenticated;
