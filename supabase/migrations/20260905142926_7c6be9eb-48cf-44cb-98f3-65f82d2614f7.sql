ALTER TABLE public.internal_messages
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

CREATE POLICY "chat anexos leitura" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-anexos');
CREATE POLICY "chat anexos envio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-anexos' AND owner = auth.uid());
CREATE POLICY "chat anexos exclusao" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-anexos' AND owner = auth.uid());