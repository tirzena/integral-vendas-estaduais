-- Conclui vendas pagas no caixa de forma atomica e gera recibo para dinheiro.
-- A funcao anterior criava a venda e os pagamentos, mas deixava o fluxo em
-- pedido_feito. Ao tentar avancar depois, a tela exigia um comprovante que a
-- propria venda em dinheiro ainda nao tinha criado.

ALTER FUNCTION public.sales_create_document_v2(
  text,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,text,date,text,text,jsonb,jsonb
) RENAME TO sales_create_document_v2_without_cash_receipt;

REVOKE ALL ON FUNCTION public.sales_create_document_v2_without_cash_receipt(
  text,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,text,date,text,text,jsonb,jsonb
) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.sales_create_document_v2(
  p_kind text,p_customer_id uuid,p_product_id uuid,
  p_currency public.currency_code,p_discount numeric,p_shipping_cost numeric,p_shipping_percentage numeric,p_notes text,
  p_payment_method text,p_payment_installments text,p_valid_until date,p_whatsapp text,p_origin text,p_items jsonb,p_payments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
  new_id uuid;
  payment_row record;
  receipt_tokens jsonb := '[]'::jsonb;
  root_id uuid;
  revision integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado.'; END IF;

  result := public.sales_create_document_v2_without_cash_receipt(
    p_kind,p_customer_id,p_product_id,p_currency,p_discount,p_shipping_cost,p_shipping_percentage,p_notes,
    p_payment_method,p_payment_installments,p_valid_until,p_whatsapp,p_origin,p_items,p_payments
  );
  new_id := (result ->> 'id')::uuid;

  IF p_kind = 'venda' THEN
    FOR payment_row IN
      SELECT p.id,p.receipt_token
      FROM public.payments p
      WHERE p.order_id = new_id
        AND p.status = 'pago'
        AND lower(btrim(coalesce(p.method,''))) = 'dinheiro'
        AND NOT EXISTS (
          SELECT 1 FROM public.order_payment_proofs proof WHERE proof.payment_id = p.id
        )
      ORDER BY p.created_at,p.id
    LOOP
      INSERT INTO public.order_payment_proofs(
        order_id,payment_id,proof_type,file_path,file_name,uploaded_by
      ) VALUES (
        new_id,payment_row.id,'recibo_sistema',payment_row.receipt_token::text,
        'Recibo-pedido-' || lpad(coalesce((result ->> 'number')::integer,0)::text,2,'0') || '.pdf',uid
      );
      receipt_tokens := receipt_tokens || jsonb_build_array(payment_row.receipt_token);
    END LOOP;

    UPDATE public.orders
    SET amount_paid = round(total,2),
        amount_receivable = 0,
        payment_status = 'pago',
        workflow_stage = 'vendido',
        status = 'faturado'
    WHERE id = new_id;

    UPDATE public.accounts_receivable
    SET amount = 0,status = 'pago',paid_at = current_date,updated_at = now()
    WHERE order_id = new_id AND status <> 'cancelado';

    SELECT coalesce(root_order_id,id),revision_no INTO root_id,revision
    FROM public.orders WHERE id = new_id;
    INSERT INTO public.order_audit_log(
      order_id,root_order_id,revision_no,action,changed_by,note,new_snapshot
    ) VALUES (
      new_id,root_id,revision,'pagamento_registrado',uid,
      'Venda quitada no caixa: ' || round((result ->> 'total')::numeric,2) || ' ' || p_currency || '.',
      public.sales_order_snapshot(new_id)
    );

    result := result || jsonb_build_object('receipt_tokens',receipt_tokens,'stage','vendido');
  END IF;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.sales_create_document_v2(
  text,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,text,date,text,text,jsonb,jsonb
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_create_document_v2(
  text,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,text,date,text,text,jsonb,jsonb
) TO authenticated;
