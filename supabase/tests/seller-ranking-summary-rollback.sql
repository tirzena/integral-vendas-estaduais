
begin;
set local role authenticated;
set local request.jwt.claim.sub='00e217fd-ed3e-4442-85c7-8e36c6c872ad';
do $test$
declare ranking jsonb; row jsonb; enzo uuid:=auth.uid();
begin
 ranking:=public.integral_ranking_summary(now()-interval '30 days',null);
 if jsonb_array_length(ranking)<>9 then raise exception 'Expected 9 active competitors, got %',jsonb_array_length(ranking); end if;
 if not exists(select 1 from jsonb_array_elements(ranking) r where r->>'userId'<>enzo::text and (r->>'units')::numeric>0) then raise exception 'Missing other sellers sales'; end if;
 for row in select value from jsonb_array_elements(ranking) loop
  if row->>'userId' in ('cf25abd8-ed9d-438d-8b09-85e27a71e808','90a39e4e-4529-4929-b682-33377cf34080','2046cc11-d5f8-4e23-b813-222b3e56a662','28d111b5-1d7d-4555-8c9d-4b5d04fea4b8','60f8d872-1e03-4fa3-bd85-f50dd17140cd') then raise exception 'Non-competing director included'; end if;
  if row->>'userId'<>enzo::text and (row->'revenue'<>'null'::jsonb or row->'bonus'<>'null'::jsonb or (row->>'canSeeMoney')::boolean or row->'products'<>'[]'::jsonb) then raise exception 'Other seller money leaked'; end if;
 end loop;
 if not exists(select 1 from jsonb_array_elements(ranking) r where r->>'userId'=enzo::text and (r->>'units')::numeric=318 and (r->>'canSeeMoney')::boolean) then raise exception 'Own seller metrics changed'; end if;
 perform set_config('request.jwt.claim.sub','b0e3cc94-57aa-4836-aba1-079d34e27d69',true);
 begin
  perform public.integral_ranking_summary(null,null);
  raise exception 'Inactive user accepted';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',enzo::text,true);
 if has_function_privilege('anon','public.integral_ranking_summary(timestamptz,uuid)','execute') or has_function_privilege('anon','private.integral_ranking_summary(timestamptz,uuid)','execute') then raise exception 'Anonymous access granted'; end if;
end $test$;
select 'PASS: Enzo sees 9 competitors, others sales and zero-sale members; money private; directors excluded; inactive and anonymous denied' result;
rollback;
