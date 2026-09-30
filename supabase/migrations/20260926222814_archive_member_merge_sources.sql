CREATE TABLE IF NOT EXISTS private.member_merge_archive (
  source_id uuid PRIMARY KEY,
  target_id uuid NOT NULL,
  source_profile jsonb NOT NULL,
  linked_rows jsonb NOT NULL,
  merged_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.member_merge_archive FROM anon, authenticated;