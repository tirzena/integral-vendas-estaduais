REVOKE EXECUTE ON FUNCTION public.sales_next_number(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_apply_stock(uuid, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_can_manage(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sales_create_document(text, uuid, uuid, currency_code, numeric, text, text, text, date, text, text, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sales_convert_quote(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sales_invoice_preorder(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sales_cancel_order(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sales_cancel_quote(uuid, text) FROM anon;