CREATE TABLE payment_attempts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'succeeded', 'failed')),
  provider_reference TEXT CHECK (
    provider_reference IS NULL OR length(trim(provider_reference)) BETWEEN 1 AND 255
  ),
  failure_code TEXT CHECK (
    failure_code IS NULL OR length(trim(failure_code)) BETWEEN 1 AND 100
  ),
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) BETWEEN 1 AND 255),
  request_fingerprint TEXT NOT NULL CHECK (length(trim(request_fingerprint)) BETWEEN 1 AND 255),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  UNIQUE (order_id, idempotency_key),
  CHECK (
    (status = 'processing' AND failure_code IS NULL)
    OR (status = 'succeeded' AND provider_reference IS NOT NULL AND failure_code IS NULL)
    OR (status = 'failed' AND failure_code IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX payment_attempts_one_processing_per_order
  ON payment_attempts(order_id)
  WHERE status = 'processing';

CREATE UNIQUE INDEX payment_attempts_one_succeeded_per_order
  ON payment_attempts(order_id)
  WHERE status = 'succeeded';
