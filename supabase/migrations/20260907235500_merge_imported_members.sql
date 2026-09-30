-- Consolida os membros importados nos perfis reais que já possuem login.
CREATE TEMP TABLE member_merge_map(old_id uuid PRIMARY KEY,new_id uuid NOT NULL,new_name text NOT NULL) ON COMMIT DROP;
INSERT INTO member_merge_map(old_id,new_id,new_name) VALUES
  ('9f8a4724-6f3a-5b94-8bef-b67cd029bb87','3949b70d-e56b-4979-9ff6-9bb6a616beda','João Vitor'),
  ('a2564462-3962-5348-bdd0-ceba2ee87237','00e217fd-ed3e-4442-85c7-8e36c6c872ad','Luyd'),
  ('0fe4a25f-20c2-5c32-8553-c5342e2fa33a','90a39e4e-4529-4929-b682-33377cf34080','Junior');

DO $$
DECLARE missing_count integer; imported_auth_count integer;
BEGIN
  SELECT count(*) INTO missing_count
  FROM member_merge_map m LEFT JOIN auth.users u ON u.id=m.new_id
  WHERE u.id IS NULL;
  IF missing_count>0 THEN RAISE EXCEPTION 'Um ou mais perfis de destino não possuem login.'; END IF;

  SELECT count(*) INTO imported_auth_count
  FROM member_merge_map m JOIN auth.users u ON u.id=m.old_id;
  IF imported_auth_count>0 THEN RAISE EXCEPTION 'Um perfil importado possui login e não pode ser removido automaticamente.'; END IF;
END $$;

INSERT INTO public.user_roles(id,user_id,role,created_at)
SELECT gen_random_uuid(),m.new_id,r.role,r.created_at
FROM public.user_roles r JOIN member_merge_map m ON m.old_id=r.user_id
ON CONFLICT (user_id,role) DO NOTHING;
DELETE FROM public.user_roles r USING member_merge_map m WHERE r.user_id=m.old_id;

INSERT INTO public.team_members(id,team_id,user_id,created_at)
SELECT gen_random_uuid(),x.team_id,m.new_id,x.created_at
FROM public.team_members x JOIN member_merge_map m ON m.old_id=x.user_id
ON CONFLICT (team_id,user_id) DO NOTHING;
DELETE FROM public.team_members x USING member_merge_map m WHERE x.user_id=m.old_id;

INSERT INTO public.product_users(id,product_id,user_id,role_in_product,created_at)
SELECT gen_random_uuid(),x.product_id,m.new_id,x.role_in_product,x.created_at
FROM public.product_users x JOIN member_merge_map m ON m.old_id=x.user_id
ON CONFLICT (product_id,user_id) DO NOTHING;
DELETE FROM public.product_users x USING member_merge_map m WHERE x.user_id=m.old_id;

INSERT INTO public.member_job_assignments(
  id,user_id,job_role_id,job_level_id,created_at,created_by,is_primary,manager_user_id,
  employment_type,status,start_date,end_date,notes)
SELECT gen_random_uuid(),m.new_id,x.job_role_id,x.job_level_id,x.created_at,
  coalesce(cm.new_id,x.created_by),false,coalesce(mm.new_id,x.manager_user_id),
  x.employment_type,x.status,x.start_date,x.end_date,x.notes
FROM public.member_job_assignments x
JOIN member_merge_map m ON m.old_id=x.user_id
LEFT JOIN member_merge_map cm ON cm.old_id=x.created_by
LEFT JOIN member_merge_map mm ON mm.old_id=x.manager_user_id
ON CONFLICT (user_id,job_role_id) DO UPDATE SET
  job_level_id=coalesce(public.member_job_assignments.job_level_id,EXCLUDED.job_level_id),
  manager_user_id=coalesce(public.member_job_assignments.manager_user_id,EXCLUDED.manager_user_id),
  notes=coalesce(public.member_job_assignments.notes,EXCLUDED.notes);
DELETE FROM public.member_job_assignments x USING member_merge_map m WHERE x.user_id=m.old_id;
UPDATE public.member_job_assignments x SET created_by=m.new_id
FROM member_merge_map m WHERE x.created_by=m.old_id;
UPDATE public.member_job_assignments x SET manager_user_id=m.new_id
FROM member_merge_map m WHERE x.manager_user_id=m.old_id;

INSERT INTO public.notice_recipients(id,notice_id,user_id,created_at)
SELECT gen_random_uuid(),x.notice_id,m.new_id,x.created_at
FROM public.notice_recipients x JOIN member_merge_map m ON m.old_id=x.user_id
ON CONFLICT (notice_id,user_id) DO NOTHING;
DELETE FROM public.notice_recipients x USING member_merge_map m WHERE x.user_id=m.old_id;

INSERT INTO public.notice_reads(id,notice_id,user_id,read_at)
SELECT gen_random_uuid(),x.notice_id,m.new_id,x.read_at
FROM public.notice_reads x JOIN member_merge_map m ON m.old_id=x.user_id
ON CONFLICT (notice_id,user_id) DO NOTHING;
DELETE FROM public.notice_reads x USING member_merge_map m WHERE x.user_id=m.old_id;

INSERT INTO public.internal_conversation_members(id,conversation_id,user_id,muted,created_at)
SELECT gen_random_uuid(),x.conversation_id,m.new_id,x.muted,x.created_at
FROM public.internal_conversation_members x JOIN member_merge_map m ON m.old_id=x.user_id
ON CONFLICT (conversation_id,user_id) DO NOTHING;
DELETE FROM public.internal_conversation_members x USING member_merge_map m WHERE x.user_id=m.old_id;

INSERT INTO public.internal_message_reads(id,message_id,user_id,read_at)
SELECT gen_random_uuid(),x.message_id,m.new_id,x.read_at
FROM public.internal_message_reads x JOIN member_merge_map m ON m.old_id=x.user_id
ON CONFLICT (message_id,user_id) DO NOTHING;
DELETE FROM public.internal_message_reads x USING member_merge_map m WHERE x.user_id=m.old_id;

-- Demais referências simples (pedidos, clientes, tarefas, financeiro, mensagens e histórico).
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass AS table_name,a.attname AS column_name
    FROM pg_constraint c
    JOIN unnest(c.conkey) WITH ORDINALITY k(attnum,ord) ON true
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
    WHERE c.contype='f' AND c.confrelid='public.profiles'::regclass
      AND c.conrelid::regclass::text NOT IN (
        'team_members','product_users','member_job_assignments','notice_recipients',
        'notice_reads','internal_conversation_members','internal_message_reads'
      )
  LOOP
    EXECUTE format(
      'UPDATE %s x SET %I=m.new_id FROM member_merge_map m WHERE x.%I=m.old_id',
      fk.table_name,fk.column_name,fk.column_name
    );
  END LOOP;
END $$;

UPDATE public.profiles p SET full_name=m.new_name,updated_at=now()
FROM member_merge_map m WHERE p.id=m.new_id;
DELETE FROM public.profiles p USING member_merge_map m WHERE p.id=m.old_id;
