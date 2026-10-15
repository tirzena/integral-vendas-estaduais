-- Controlled fixtures only. Every block ends with ROLLBACK.

BEGIN;
DO $$ DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); extra_member uuid:=gen_random_uuid(); payload jsonb; BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data,created_at) VALUES
 (a,'integral-general-test-'||a||'@example.invalid','{}',now()),
 (b,'integral-general-test-'||b||'@example.invalid','{}',now()),
 (c,'integral-general-test-'||c||'@example.invalid','{}',now()),
 (admin_id,'integral-general-test-'||admin_id||'@example.invalid','{}',now()),(extra_member,'integral-general-test-'||extra_member||'@example.invalid','{}',now());
 INSERT INTO public.user_roles(user_id,role) VALUES(a,'superadmin'),(admin_id,'admin');
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF NOT public.integral_my_general_access() THEN RAISE EXCEPTION 'Legacy account lost general access'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 payload:=jsonb_build_object('full_name','Controlled entry member','email','controlled@example.invalid','roles',jsonb_build_array('vendedor'),'general_access',false,'product_ids','[]'::jsonb,'warehouse_ids','[]'::jsonb,'access','[]'::jsonb,'jobs','[]'::jsonb,'deals','[]'::jsonb);
 PERFORM public.integral_configure_new_member(a,b,payload);
 PERFORM public.integral_configure_new_member(a,c,payload||jsonb_build_object('general_access',true));
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM public.integral_update_member_grants(b,jsonb_build_object('product_ids','[]'::jsonb,'warehouse_ids','[]'::jsonb,'general_access',null));
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF public.integral_my_general_access() THEN RAISE EXCEPTION 'Null bypassed explicit denial'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c::text,true);
 IF NOT public.integral_my_general_access() THEN RAISE EXCEPTION 'Granted member cannot enter general'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM public.integral_update_member_grants(b,jsonb_build_object('product_ids','[]'::jsonb,'warehouse_ids','[]'::jsonb,'general_access',true));
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF NOT public.integral_my_general_access() THEN RAISE EXCEPTION 'Manual grant failed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 UPDATE public.profiles SET is_active=false WHERE id=b;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF public.integral_my_general_access() THEN RAISE EXCEPTION 'Inactive account allowed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 INSERT INTO public.integral_member_rules(user_id,general_access) VALUES(admin_id,false);
 BEGIN PERFORM public.integral_configure_new_member(admin_id,extra_member,payload-'general_access'); RAISE EXCEPTION 'Missing field bypassed delegating admin limit'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 BEGIN PERFORM public.integral_update_member_grants(a,jsonb_build_object('product_ids','[]'::jsonb,'warehouse_ids','[]'::jsonb)); RAISE EXCEPTION 'Admin edited superadmin'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.integral_my_general_access() THEN RAISE EXCEPTION 'Missing identity allowed'; END IF;
 IF has_function_privilege('anon','public.integral_my_general_access()','EXECUTE') OR has_function_privilege('authenticated','public.integral_configure_new_member(uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe execute grants'; END IF;
END $$;
SELECT 'General entry: legacy, explicit grant/deny, manual grant, inactive, admin limits and ACL passed' result;
ROLLBACK;

BEGIN;
DO $$ DECLARE actor uuid:=gen_random_uuid(); member uuid:=gen_random_uuid(); bad_member uuid:=gen_random_uuid(); prod uuid:=gen_random_uuid(); other_prod uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); excluded_item uuid:=gen_random_uuid(); payload jsonb; BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data,created_at) VALUES(actor,'integral-agreement-test-'||actor||'@example.invalid','{}',now()),(member,'integral-agreement-test-'||member||'@example.invalid','{}',now()),(bad_member,'integral-agreement-test-'||bad_member||'@example.invalid','{}',now());
 INSERT INTO public.user_roles(user_id,role) VALUES(actor,'superadmin');
 INSERT INTO public.products(id,name,is_active,is_demo) VALUES(prod,'Controlled agreement category',true,true),(other_prod,'Controlled other category',true,true);
 INSERT INTO public.inventory_items(id,product_id,name,unit,currency,cost,price,quantity,reserved,is_active,is_demo)
 VALUES(item,prod,'Controlled agreed item','UN','BRL',10,100,0,0,true,true),(excluded_item,prod,'Controlled excluded item','UN','BRL',10,100,0,0,true,true);
 payload:=jsonb_build_object('full_name','Controlled agreement member','email','controlled@example.invalid','roles',jsonb_build_array('vendedor'),'general_access',true,'product_ids',jsonb_build_array(prod),'excluded_item_ids',jsonb_build_array(excluded_item),'warehouse_ids','[]'::jsonb,'access','[]'::jsonb,'jobs','[]'::jsonb,'deals',jsonb_build_array(
 jsonb_build_object('label','Specific commission','item_id',item,'comp_type','percent','amount',7,'currency','BRL','period','per_sale','notes','Controlled condition'),
 jsonb_build_object('label','Monthly fixed','comp_type','fixed','amount',100,'currency','BRL','period','month')));
 PERFORM public.integral_configure_new_member(actor,member,payload);
 IF NOT EXISTS(SELECT 1 FROM public.member_compensations WHERE user_id=member AND item_id=item AND product_id=prod AND amount=7 AND notes='Controlled condition') THEN RAISE EXCEPTION 'Item agreement not normalized or persisted'; END IF;
 IF (SELECT count(*) FROM public.member_compensations WHERE user_id=member)<>2 THEN RAISE EXCEPTION 'Multiple agreements not persisted'; END IF;
 BEGIN
 PERFORM public.integral_configure_new_member(actor,bad_member,jsonb_set(payload,'{deals,0,item_id}',to_jsonb(excluded_item)));
 RAISE EXCEPTION 'Excluded item agreement allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Produto do acordo não concedido ao membro.' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.integral_member_rules WHERE user_id=bad_member) THEN RAISE EXCEPTION 'Failed configuration partially persisted'; END IF;
 BEGIN
 INSERT INTO public.member_compensations(user_id,item_id,product_id,comp_type,amount,currency,period) VALUES(member,item,other_prod,'percent',5,'BRL','per_sale');
 RAISE EXCEPTION 'Cross-category agreement allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Produto fora da categoria do acordo.' THEN RAISE; END IF;
 END;
 BEGIN
 INSERT INTO public.member_compensations(user_id,comp_type,amount,currency,period) VALUES(member,'percent',101,'BRL','per_sale');
 RAISE EXCEPTION 'Invalid percentage allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Valor, percentual ou periodicidade inválidos.' THEN RAISE; END IF;
 END;
 BEGIN
 INSERT INTO public.member_compensations(user_id,comp_type,amount,currency,period) VALUES(member,'fixed',100,'BRL',NULL);
 RAISE EXCEPTION 'Missing period allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Valor, percentual ou periodicidade inválidos.' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.orders WHERE seller_id=member) OR EXISTS(SELECT 1 FROM public.payroll_entries WHERE user_id=member) THEN RAISE EXCEPTION 'Configuration created financial postings'; END IF;
END $$;
SELECT 'Item agreement, conditions, multiple scopes, excluded item rejection and atomic rollback passed' result;
ROLLBACK;