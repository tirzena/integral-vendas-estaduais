BEGIN;
DO $test$
DECLARE seller uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); admin_id uuid; prod uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); label text:='Price notification fixture '||gen_random_uuid();
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='superadmin' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 INSERT INTO auth.users(id,email,raw_user_meta_data,created_at) VALUES
 (seller,'notify-'||seller||'@example.invalid','{}',now()),
 (outsider,'notify-'||outsider||'@example.invalid','{}',now());
 INSERT INTO public.user_roles(user_id,role) VALUES(seller,'vendedor'),(outsider,'vendedor') ON CONFLICT DO NOTHING;
 INSERT INTO public.products(id,name,is_active,is_demo) VALUES(prod,label,true,true);
 INSERT INTO public.inventory_items(id,product_id,name,unit,currency,price_currency,cost,price,quantity,reserved,is_active,is_demo)
 VALUES(item,prod,label,'UN','BRL','BRL',10,100,0,0,true,true);
 INSERT INTO public.product_users(user_id,product_id) VALUES(seller,prod);
 UPDATE public.inventory_items SET price=125 WHERE id=item;
 IF (SELECT count(*) FROM public.notifications WHERE body LIKE label||'%' AND user_id=seller AND notification_type='product_price_changed')<>1 THEN RAISE EXCEPTION 'Missing seller price notification'; END IF;
 IF EXISTS(SELECT 1 FROM public.notifications WHERE body LIKE label||'%' AND user_id=outsider) THEN RAISE EXCEPTION 'Unpermitted product leaked'; END IF;
 UPDATE public.inventory_items SET price=125,cost=20,quantity=2 WHERE id=item;
 IF (SELECT count(*) FROM public.notifications WHERE body LIKE label||'%' AND user_id=seller)<>1 THEN RAISE EXCEPTION 'No-op/cost update duplicated alert'; END IF;
 UPDATE public.inventory_items SET price_currency='USD' WHERE id=item;
 IF (SELECT count(*) FROM public.notifications WHERE body LIKE label||'%' AND user_id=seller)<>2 THEN RAISE EXCEPTION 'Currency change not notified'; END IF;
 INSERT INTO public.notifications(user_id,title,body,notification_type) VALUES(outsider,'Private fixture',label,'test');
 PERFORM set_config('request.jwt.claim.sub',seller::text,true);
 PERFORM set_config('test.price_notification_label',label,true);
END $test$;
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.notifications WHERE body LIKE current_setting('test.price_notification_label')||'%')<>2 THEN RAISE EXCEPTION 'Seller cannot read own notifications or reads another member'; END IF;
 PERFORM public.acknowledge_my_notifications();
 IF EXISTS(SELECT 1 FROM public.notifications WHERE read_at IS NULL) THEN RAISE EXCEPTION 'Acknowledgement failed'; END IF;
END $test$;
SELECT 'price_change_scope_currency_dedup_read_ack_passed' AS result;
ROLLBACK;
