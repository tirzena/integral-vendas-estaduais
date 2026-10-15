INSERT INTO private.integral_policy_backups(label,payload)
SELECT 'before_receipt_confirmation_date_20261015',jsonb_build_object('function',pg_get_functiondef('private.seller_confirm_canonical(uuid,numeric,text,uuid,uuid)'::regprocedure))
WHERE NOT EXISTS(SELECT 1 FROM private.integral_policy_backups WHERE label='before_receipt_confirmation_date_20261015');
CREATE OR REPLACE FUNCTION private.seller_confirm_canonical(p_order_id uuid, p_amount numeric, p_method text, p_proof_id uuid, p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; proof public.order_payment_proofs%ROWTYPE; paid_total numeric:=0; remaining numeric:=0; new_payment_id uuid; root_id uuid; before_snapshot jsonb; next_stage text; receipt uuid; is_cash boolean:=lower(btrim(coalesce(p_method,'')))='dinheiro';
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF o.id IS NULL OR o.status='cancelado' OR o.deleted_at IS NOT NULL OR NOT private.seller_legacy_sales_can_manage(uid,o.seller_id) THEN RAISE EXCEPTION 'Sem permissão para registrar pagamento neste pedido.'; END IF;
 IF NOT is_cash THEN SELECT * INTO proof FROM public.order_payment_proofs WHERE id=p_proof_id AND order_id=o.id AND payment_id IS NULL FOR UPDATE; IF proof.id IS NULL THEN RAISE EXCEPTION 'Selecione um comprovante ainda não utilizado.'; END IF; END IF;
 IF coalesce(p_amount,0)<=0 OR coalesce(btrim(p_method),'')='' THEN RAISE EXCEPTION 'Informe valor e forma de pagamento.'; END IF;
 SELECT coalesce(sum(amount),0) INTO paid_total FROM public.payments WHERE order_id=o.id AND status='pago'; remaining:=round(o.total-paid_total,2);
 IF round(p_amount,2)>remaining THEN RAISE EXCEPTION 'O pagamento é maior que o saldo restante.'; END IF;
 before_snapshot:=private.seller_legacy_sales_order_snapshot(o.id); root_id:=coalesce(o.root_order_id,o.id);
 IF o.stock_state='reservado' THEN
 PERFORM private.seller_apply_paid_stock(o.id,'baixar_reservado',uid,
 COALESCE((SELECT s.settled_ratio FROM private.seller_stock_settlements s WHERE s.order_id=o.id),0),
 least(1,greatest(0,(paid_total+p_amount)/NULLIF(o.total,0))));
 UPDATE private.seller_stock_settlements s SET settled_ratio=least(1,greatest(0,(paid_total+p_amount)/NULLIF(o.total,0))) WHERE s.order_id=o.id;
 END IF;
 UPDATE public.payments p SET status='pago',paid_at=coalesce(p.paid_at,current_date)
    WHERE p.id=p_payment_id AND p.order_id=o.id AND p.status='pendente'
    RETURNING p.id,p.receipt_token INTO new_payment_id,receipt;
    IF new_payment_id IS NULL THEN RAISE EXCEPTION 'Receipt is not pending.'; END IF;
 IF is_cash AND NOT EXISTS(SELECT 1 FROM public.order_payment_proofs p WHERE p.payment_id=new_payment_id AND p.proof_type='recibo_sistema') THEN INSERT INTO public.order_payment_proofs(order_id,payment_id,proof_type,file_path,file_name,uploaded_by) VALUES(o.id,new_payment_id,'recibo_sistema',receipt::text,'Recibo-pedido-'||lpad(coalesce(o.number,0)::text,2,'0')||'.pdf',uid); ELSE UPDATE public.order_payment_proofs SET payment_id=new_payment_id WHERE id=proof.id; END IF;
 paid_total:=round(paid_total+p_amount,2); remaining:=greatest(0,round(o.total-paid_total,2)); next_stage:=CASE WHEN remaining=0 THEN 'vendido' ELSE 'pagamento_parcial' END;
 UPDATE public.orders SET kind='venda',stock_state=CASE WHEN o.stock_state='baixado' OR remaining=0 THEN 'baixado' ELSE 'reservado' END,amount_paid=paid_total,amount_receivable=remaining,payment_status=CASE WHEN remaining=0 THEN 'pago' ELSE 'parcial' END,workflow_stage=next_stage,status='faturado' WHERE id=o.id;
 IF EXISTS(SELECT 1 FROM public.accounts_receivable WHERE order_id=o.id AND status<>'cancelado') THEN UPDATE public.accounts_receivable SET amount=remaining,status=CASE WHEN remaining=0 THEN 'pago' ELSE 'pendente' END,paid_at=CASE WHEN remaining=0 THEN current_date ELSE NULL END,updated_at=now() WHERE order_id=o.id AND status<>'cancelado'; ELSIF remaining>0 THEN INSERT INTO public.accounts_receivable(description,customer_id,product_id,order_id,amount,currency,due_date,status) VALUES('Saldo do pedido '||coalesce(o.number::text,o.id::text),o.customer_id,o.product_id,o.id,remaining,o.currency,current_date,'pendente'); END IF;
 INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot) VALUES(o.id,root_id,o.revision_no,'pagamento_registrado',uid,'Pagamento registrado: '||round(p_amount,2)||' '||o.currency||'. Saldo: '||remaining||' '||o.currency,before_snapshot,private.seller_legacy_sales_order_snapshot(o.id));
 RETURN jsonb_build_object('id',o.id,'payment_id',new_payment_id,'receipt_token',CASE WHEN is_cash THEN receipt ELSE NULL END,'paid',paid_total,'remaining',remaining,'stage',next_stage);
END $function$
;