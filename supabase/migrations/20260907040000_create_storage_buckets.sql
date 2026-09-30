INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('chat-anexos', 'chat-anexos', false, 22000000),
  ('produtos', 'produtos', false, 10000000)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;
