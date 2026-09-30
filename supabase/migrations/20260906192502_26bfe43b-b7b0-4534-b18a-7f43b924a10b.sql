CREATE POLICY "produtos_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'produtos');
CREATE POLICY "produtos_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'produtos');
CREATE POLICY "produtos_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'produtos') WITH CHECK (bucket_id = 'produtos');
CREATE POLICY "produtos_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'produtos');