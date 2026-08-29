ALTER TABLE payment_attempts RENAME TO payment_attempts_legacy;
ALTER TABLE orders RENAME TO orders_legacy;

CREATE TABLE orders (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, ticket_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'payment_processing', 'complete', 'expired')),
  expires_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  ticket_event_name TEXT NOT NULL, ticket_event_starts_at INTEGER NOT NULL,
  ticket_event_ends_at INTEGER CHECK (ticket_event_ends_at IS NULL OR ticket_event_ends_at > ticket_event_starts_at),
  ticket_place TEXT NOT NULL, ticket_info TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
) STRICT;

INSERT INTO orders (id, user_id, ticket_id, amount_cents, currency, status, expires_at, version,
  ticket_event_name, ticket_event_starts_at, ticket_event_ends_at, ticket_place, ticket_info, created_at, updated_at)
SELECT id, user_id, ticket_id, amount_cents, currency,
  CASE WHEN status IN ('pending', 'payment_processing') THEN 'expired' ELSE status END,
  expires_at, version, 'Unavailable', created_at, NULL, 'Unavailable', 'Unavailable',
  created_at, updated_at FROM orders_legacy;

CREATE TABLE payment_attempts (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'succeeded', 'failed')),
  provider_scenario TEXT NOT NULL CHECK (provider_scenario IN ('local.success', 'local.decline', 'local.processing-success', 'local.processing-decline')),
  provider_reference TEXT CHECK (provider_reference IS NULL OR length(trim(provider_reference)) BETWEEN 1 AND 255),
  failure_code TEXT CHECK (failure_code IS NULL OR length(trim(failure_code)) BETWEEN 1 AND 100),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) > 0),
  reconcile_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (reconcile_attempt_count >= 0),
  next_reconcile_at INTEGER, last_reconcile_error TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  UNIQUE (order_id, idempotency_key),
  CHECK ((status = 'processing' AND failure_code IS NULL AND next_reconcile_at IS NOT NULL)
    OR (status = 'succeeded' AND provider_reference IS NOT NULL AND failure_code IS NULL AND next_reconcile_at IS NULL)
    OR (status = 'failed' AND failure_code IS NOT NULL AND next_reconcile_at IS NULL))
) STRICT;

INSERT INTO payment_attempts (id, order_id, status, provider_scenario, provider_reference, failure_code,
  idempotency_key, request_fingerprint, next_reconcile_at, created_at, updated_at)
SELECT id, order_id,
  CASE WHEN status = 'processing' THEN 'failed' ELSE status END,
  CASE WHEN status IN ('processing', 'failed') THEN 'local.decline' ELSE 'local.success' END,
  provider_reference,
  CASE WHEN status = 'processing' THEN 'migration_invalidated' ELSE failure_code END,
  idempotency_key, request_fingerprint, NULL, created_at, updated_at
FROM payment_attempts_legacy;

DROP TABLE payment_attempts_legacy;
DROP TABLE orders_legacy;
CREATE INDEX orders_buyer_history ON orders(user_id, created_at DESC, id) WHERE status IN ('pending', 'payment_processing', 'complete');
CREATE INDEX orders_due_pending ON orders(expires_at, id) WHERE status = 'pending';
CREATE UNIQUE INDEX payment_attempts_one_processing_per_order ON payment_attempts(order_id) WHERE status = 'processing';
CREATE UNIQUE INDEX payment_attempts_one_succeeded_per_order ON payment_attempts(order_id) WHERE status = 'succeeded';
CREATE INDEX payment_attempts_due_reconciliation ON payment_attempts(next_reconcile_at, id) WHERE status = 'processing';

CREATE TRIGGER orders_immutable BEFORE UPDATE ON orders
WHEN NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.ticket_id <> OLD.ticket_id
 OR NEW.amount_cents <> OLD.amount_cents OR NEW.currency <> OLD.currency OR NEW.expires_at <> OLD.expires_at
 OR NEW.ticket_event_name <> OLD.ticket_event_name OR NEW.ticket_event_starts_at <> OLD.ticket_event_starts_at
 OR NEW.ticket_event_ends_at IS NOT OLD.ticket_event_ends_at OR NEW.ticket_place <> OLD.ticket_place
 OR NEW.ticket_info <> OLD.ticket_info OR NEW.created_at <> OLD.created_at
BEGIN SELECT RAISE(ABORT, 'immutable order fields'); END;
CREATE TRIGGER payment_attempts_immutable BEFORE UPDATE ON payment_attempts
WHEN NEW.id <> OLD.id OR NEW.order_id <> OLD.order_id OR NEW.provider_scenario <> OLD.provider_scenario
 OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.request_fingerprint <> OLD.request_fingerprint OR NEW.created_at <> OLD.created_at
BEGIN SELECT RAISE(ABORT, 'immutable payment attempt fields'); END;
