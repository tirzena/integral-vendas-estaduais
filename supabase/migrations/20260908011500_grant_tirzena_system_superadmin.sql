DO $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE lower(email)=lower('tirzenasistema@gmail.com')
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário tirzenasistema@gmail.com não encontrado no Auth';
  END IF;

  INSERT INTO public.profiles(id,full_name,email,is_active)
  VALUES(target_user_id,'Tirzena Sistema','tirzenasistema@gmail.com',true)
  ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,is_active=true;

  INSERT INTO public.user_roles(user_id,role)
  VALUES(target_user_id,'superadmin'::public.app_role)
  ON CONFLICT(user_id,role) DO NOTHING;
END $$;
