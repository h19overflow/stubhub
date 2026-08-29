CREATE TABLE purchase_operations (
  order_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) > 0),
  ticket_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('reserving', 'completed', 'releasing', 'rejected')),
  rejection_code TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_retry_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  UNIQUE (user_id, idempotency_key),
  CHECK ((state = 'rejected' AND rejection_code IS NOT NULL AND length(trim(rejection_code)) > 0) OR (state <> 'rejected' AND rejection_code IS NULL)),
  CHECK ((state IN ('reserving', 'releasing') AND next_retry_at IS NOT NULL) OR (state IN ('completed', 'rejected') AND next_retry_at IS NULL))
) STRICT;

INSERT INTO purchase_operations (
  order_id, user_id, idempotency_key, request_fingerprint, ticket_id, expires_at,
  state, created_at, updated_at
)
SELECT id, user_id, idempotency_key, request_fingerprint, ticket_id, expires_at,
       'completed', created_at, updated_at
FROM orders;

CREATE INDEX purchase_operations_due_retry
  ON purchase_operations(next_retry_at, order_id)
  WHERE state IN ('reserving', 'releasing');

CREATE TRIGGER purchase_operations_immutable
BEFORE UPDATE ON purchase_operations
WHEN NEW.order_id <> OLD.order_id OR NEW.user_id <> OLD.user_id
  OR NEW.idempotency_key <> OLD.idempotency_key
  OR NEW.request_fingerprint <> OLD.request_fingerprint
  OR NEW.ticket_id <> OLD.ticket_id OR NEW.expires_at <> OLD.expires_at
  OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'immutable purchase operation fields');
END;
