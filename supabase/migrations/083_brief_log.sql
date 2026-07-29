-- Brief log: stores all NLP brief submissions for debugging and parser improvement
CREATE TABLE IF NOT EXISTS brief_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advertiser_id BIGINT REFERENCES advertisers(id) ON DELETE SET NULL,
  brief       TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('proposed', 'created', 'insufficient', 'error')),
  plan        JSONB,
  campaign_id TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brief_log_advertiser ON brief_log(advertiser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brief_log_status ON brief_log(status, created_at DESC);

ALTER TABLE brief_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access; users cannot read brief logs directly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='brief_log'
      AND policyname='service_role full access'
  ) THEN
    CREATE POLICY "service_role full access" ON brief_log
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END;
$$;
