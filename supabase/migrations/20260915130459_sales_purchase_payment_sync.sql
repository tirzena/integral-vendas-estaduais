-- Internal proportional settlement: order receipts also represent supplier repasses.
-- No new client permissions. Existing privileged order/payment RPCs run the triggers.
CREATE OR REPLACE FUNCTION public.purchase_sync_sales_payment(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 sales public.orders%ROWTYPE;
 purchase public.purchase_orders%ROWTYPE;
 ratio numeric; existing_paid numeric; target_paid numeric; delta numeric; next_installment integer;
 stamp date; actor uuid; remaining numeric;
BEGIN
 SELECT * INTO sales FROM public.orders WHERE id = p_order_id;
 IF NOT FOUND OR sales.deleted_at IS NOT NULL OR sales.superseded_at IS NOT NULL
    OR sales.status = 'cancelado' OR sales.workflow_stage = 'cancelado' THEN RETURN; END IF;
 IF COALESCE(sales.total,0) <= 0 OR COALESCE(sales.amount_paid,0) <= 0 THEN RETURN; END IF;
 ratio := least(1, greatest(0, sales.amount_paid / sales.total));
 -- Date comes from the latest recorded receipt, never an invented historic payment date.
 SELECT max(paid_at) INTO stamp FROM public.payments WHERE order_id=sales.id AND status='pago';
 stamp := COALESCE(stamp, current_date);
 FOR purchase IN SELECT * FROM public.purchase_orders
   WHERE source_order_id=sales.id AND source_type='sales_order' AND status<>'cancelada'
   ORDER BY id FOR UPDATE
 LOOP
   target_paid := round(purchase.total * ratio, 2);
   SELECT greatest(purchase.amount_paid, COALESCE(sum(amount),0)) INTO existing_paid
     FROM public.purchase_payments WHERE purchase_order_id=purchase.id;
   target_paid := greatest(target_paid, existing_paid);
   delta := round(target_paid - existing_paid, 2);
   -- Already paid (manual or automatic) is never duplicated or silently reversed.
   IF delta > 0 THEN
   actor := COALESCE(auth.uid(), sales.seller_id, purchase.created_by);
   SELECT COALESCE(max(installment),0)+1 INTO next_installment
     FROM public.purchase_payments WHERE purchase_order_id=purchase.id;
   INSERT INTO public.purchase_payments(purchase_order_id,installment,amount,currency,
     method,paid_at,reference,notes,created_by)
   VALUES(purchase.id,next_installment,delta,purchase.currency,'Repasse vinculado ao pedido',
     stamp,'sales-payment:'||sales.id::text||':'||target_paid::text,
     'Baixa automática proporcional ao recebimento do pedido #'||sales.number::text,
     actor);
   END IF;
   remaining := greatest(0, round(purchase.total-target_paid,2));
   UPDATE public.purchase_orders SET amount_paid=target_paid,amount_payable=remaining,
     payment_status=CASE WHEN remaining=0 THEN 'pago' ELSE 'parcial' END,updated_at=now()
     WHERE id=purchase.id;
   UPDATE public.accounts_payable SET
     status=CASE WHEN remaining=0 THEN 'pago' ELSE 'pendente' END,
     paid_at=CASE WHEN remaining=0 THEN stamp ELSE NULL END,updated_at=now()
     WHERE id=purchase.account_payable_id;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.purchase_sync_sales_payment(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_sync_sales_payment(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.purchase_sales_payment_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='orders' THEN PERFORM public.purchase_sync_sales_payment(NEW.id);
 ELSE PERFORM public.purchase_sync_sales_payment(NEW.source_order_id); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.purchase_sales_payment_trigger() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_zz_purchase_sales_payment ON public.orders;
CREATE TRIGGER trg_zz_purchase_sales_payment
 AFTER UPDATE OF amount_paid,payment_status,workflow_stage,total ON public.orders
 FOR EACH ROW EXECUTE FUNCTION public.purchase_sales_payment_trigger();
DROP TRIGGER IF EXISTS trg_purchase_sales_payment_created ON public.purchase_orders;
CREATE TRIGGER trg_purchase_sales_payment_created
 AFTER INSERT OR UPDATE OF total,source_order_id,status,account_payable_id ON public.purchase_orders
 FOR EACH ROW WHEN(NEW.source_type='sales_order' AND NEW.source_order_id IS NOT NULL)
 EXECUTE FUNCTION public.purchase_sales_payment_trigger();

-- Reconcile existing active purchase links. Re-running produces no duplicate payments.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT DISTINCT source_order_id FROM public.purchase_orders
   WHERE source_type='sales_order' AND status<>'cancelada' AND source_order_id IS NOT NULL
   ORDER BY source_order_id
 LOOP PERFORM public.purchase_sync_sales_payment(r.source_order_id); END LOOP;
END $$;
