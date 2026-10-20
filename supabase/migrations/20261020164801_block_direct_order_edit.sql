CREATE OR REPLACE FUNCTION public.sales_replace_order_version(p_previous_order_id uuid, p_customer_id uuid, p_product_id uuid, p_currency currency_code, p_discount numeric, p_shipping_cost numeric, p_shipping_percentage numeric, p_notes text, p_whatsapp text, p_items jsonb, p_warehouse_id uuid, p_shipping_address text, p_shipping_city text, p_shipping_state text, p_delivery_deadline date, p_carrier text, p_tracking_code text, p_revision_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN RAISE EXCEPTION 'Edição direta desativada. Use Editar pedido nos detalhes para enviar a alteração à aprovação.' USING ERRCODE='42501'; END $function$;

CREATE OR REPLACE FUNCTION public.sales_save_order_edit(p_args jsonb, p_followup jsonb, p_exchange jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN RAISE EXCEPTION 'Edição direta desativada. Use Editar pedido nos detalhes para enviar a alteração à aprovação.' USING ERRCODE='42501'; END $function$;
