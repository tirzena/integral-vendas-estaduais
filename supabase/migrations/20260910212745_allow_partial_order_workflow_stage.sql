-- Permite que o fluxo do pedido acompanhe um pagamento ainda não quitado.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_workflow_stage_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_workflow_stage_check
  CHECK (
    workflow_stage IN (
      'pedido_feito',
      'em_caminho',
      'vendido',
      'pagamento_parcial',
      'esperando_pagamento',
      'cancelado'
    )
  );
