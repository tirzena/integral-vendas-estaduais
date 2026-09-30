-- Evita que importações ou correções futuras voltem a criar dois pedidos
-- atuais com o mesmo número. Versões antigas e pedidos excluídos continuam
-- podendo conservar o número original para fins de histórico.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE deleted_at IS NULL AND superseded_at IS NULL
    GROUP BY number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem números repetidos entre os pedidos ativos.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_active_number_uq
  ON public.orders(number)
  WHERE deleted_at IS NULL AND superseded_at IS NULL;

INSERT INTO public.document_counters(scope,last_number,updated_at)
VALUES (
  'orders',
  coalesce((SELECT max(number) FROM public.orders WHERE deleted_at IS NULL AND superseded_at IS NULL),0),
  now()
)
ON CONFLICT (scope) DO UPDATE SET
  last_number=greatest(public.document_counters.last_number,excluded.last_number),
  updated_at=now();
