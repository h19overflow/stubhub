CREATE TABLE local_provider_payments (
  id TEXT PRIMARY KEY,
  payment_attempt_id TEXT NOT NULL UNIQUE,
  provider_idempotency_key TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) > 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  status TEXT NOT NULL CHECK (status IN ('processing', 'succeeded', 'declined')),
  planned_terminal_outcome TEXT NOT NULL CHECK (planned_terminal_outcome IN ('succeeded', 'declined')),
  resolve_at INTEGER NOT NULL,
  failure_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  CHECK ((status = 'processing' AND resolve_at > created_at AND failure_code IS NULL)
    OR (status = 'succeeded' AND planned_terminal_outcome = 'succeeded' AND failure_code IS NULL AND updated_at >= resolve_at)
    OR (status = 'declined' AND planned_terminal_outcome = 'declined' AND failure_code IS NOT NULL AND updated_at >= resolve_at))
) STRICT;
CREATE INDEX local_provider_payments_due_resolution
  ON local_provider_payments(resolve_at, id) WHERE status = 'processing';
