CREATE OR REPLACE FUNCTION public.integral_seller_create_order(p_request jsonb, p_request_id uuid, p_expected_quote jsonb, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
DECLARE actor uuid:=private.seller_require_actor();
  sale jsonb; order_id uuid; linked_customer uuid; customer uuid;
  customer_name text; customer_phone text;
BEGIN
 IF NOT private.integral_operation_allowed(actor,'orders.create') THEN RAISE EXCEPTION 'Criação de pedidos não concedida.' USING ERRCODE='42501'; END IF;
 sale:=public.seller_portal_create_sale(p_request,p_request_id,NULL,p_expected_quote);
 order_id:=(sale->>'id')::uuid;
 SELECT o.customer_id INTO linked_customer FROM public.orders o
 WHERE o.id=order_id AND o.seller_id=actor;
 IF NOT FOUND THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Order ownership mismatch.';
 END IF;
 IF linked_customer IS NOT NULL THEN
   IF p_customer_id IS NOT NULL AND p_customer_id<>linked_customer THEN
     RAISE EXCEPTION 'Request already linked to a different customer.';
   END IF;
   RETURN sale||jsonb_build_object('customer_id',linked_customer);
 END IF;
 customer_name:=btrim(coalesce(p_request->'customer'->>'name',''));
 customer_phone:=nullif(btrim(coalesce(p_request->'customer'->>'phone','')),'');
 IF length(customer_name) NOT BETWEEN 1 AND 150 OR length(coalesce(customer_phone,''))>80
 THEN RAISE EXCEPTION 'Invalid customer details.'; END IF;
 IF p_customer_id IS NOT NULL THEN
   SELECT c.id INTO customer FROM public.customers c
   WHERE c.id=p_customer_id AND c.deleted_at IS NULL AND (
     c.created_by=actor OR EXISTS(
       SELECT 1 FROM public.orders o WHERE o.customer_id=c.id AND o.seller_id=actor
         AND o.id<>order_id AND o.deleted_at IS NULL AND o.superseded_at IS NULL
     ) OR EXISTS(
       SELECT 1 FROM public.customer_products cp
       WHERE cp.customer_id=c.id AND cp.owner_id=actor
     )
   );
   IF customer IS NULL THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Customer not assigned.';
   END IF;
 ELSE
   SELECT c.id INTO customer FROM public.customers c
   WHERE c.deleted_at IS NULL AND c.created_by=actor
     AND lower(btrim(c.name))=lower(customer_name)
     AND coalesce(c.phone,'')=coalesce(customer_phone,'')
   ORDER BY c.created_at,c.id LIMIT 1;
 END IF;
 INSERT INTO private.seller_creation_context(backend_pid,transaction_id,actor,new_order_id,operation)
 VALUES(pg_backend_pid(),txid_current(),actor,order_id,'create_sale');
 IF customer IS NULL THEN
   INSERT INTO public.customers(name,phone,whatsapp,created_by,origin)
   VALUES(customer_name,customer_phone,customer_phone,actor,'Vendas Estaduais')
   RETURNING id INTO customer;
 END IF;
 UPDATE public.orders SET customer_id=customer WHERE id=order_id AND seller_id=actor;
 DELETE FROM private.seller_creation_context c
 WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
   AND c.actor=actor AND c.new_order_id=order_id AND c.operation='create_sale';
 RETURN sale||jsonb_build_object('customer_id',customer);
END $function$
;
REVOKE ALL ON FUNCTION public.integral_seller_create_order(jsonb,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_seller_create_order(jsonb,uuid,jsonb,uuid) TO authenticated;