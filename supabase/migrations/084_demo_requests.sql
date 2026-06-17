-- Demo request form submissions from getnorma.app/demo
-- Replaces Calendly link; team reviews from Supabase dashboard or admin panel

CREATE TABLE demo_requests (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name   TEXT NOT NULL,
  company     TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT,
  topic       TEXT NOT NULL,
  message     TEXT,
  status      TEXT NOT NULL DEFAULT 'new',  -- new | contacted | booked | closed
  source      TEXT NOT NULL DEFAULT 'developers_page',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_demo_requests_status ON demo_requests(status);
CREATE INDEX idx_demo_requests_created ON demo_requests(created_at DESC);

ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;
-- Service role only — no user-facing access needed

COMMENT ON TABLE demo_requests IS 'Demo booking requests submitted via getnorma.app/demo';
COMMENT ON COLUMN demo_requests.status IS 'new | contacted | booked | closed';
COMMENT ON COLUMN demo_requests.source IS 'Which page/CTA the request came from';
