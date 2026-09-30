-- O catálogo público do OS recebe pedidos com quantidade e endereço de entrega.
UPDATE public.digital_catalogs
SET orders_enabled = true,
    delivery_enabled = true,
    pickup_enabled = true
WHERE is_published = true;
