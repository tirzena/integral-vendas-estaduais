-- Permite que pedidos com saldo em aberto sejam classificados como pagamento parcial.
-- As funções de pagamento já gravam "parcial" quando o total recebido é menor
-- que o total do pedido, mas a restrição original ainda aceitava somente
-- a_pagar, pago e cancelado.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('a_pagar', 'parcial', 'pago', 'cancelado'));
