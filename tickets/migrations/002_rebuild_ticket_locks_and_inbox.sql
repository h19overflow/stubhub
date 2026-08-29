CREATE TABLE tickets_rebuilt (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  description TEXT NOT NULL,
  event_starts_at INTEGER NOT NULL,
  event_ends_at INTEGER CHECK (
    event_ends_at IS NULL OR event_ends_at > event_starts_at
  ),
  ticket_info TEXT NOT NULL,
  place TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  image_filename TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold')),
  locked_by_order_id TEXT,
  lock_expires_at INTEGER,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (owner_id, idempotency_key),
  CHECK (
    (status = 'available' AND locked_by_order_id IS NULL AND lock_expires_at IS NULL)
    OR (status = 'reserved' AND locked_by_order_id IS NOT NULL AND lock_expires_at IS NOT NULL)
    OR (status = 'sold' AND locked_by_order_id IS NOT NULL AND lock_expires_at IS NULL)
  )
) STRICT;

INSERT INTO tickets_rebuilt SELECT * FROM tickets;
DROP TABLE tickets;
ALTER TABLE tickets_rebuilt RENAME TO tickets;

CREATE INDEX tickets_available_discovery
  ON tickets(status, event_starts_at, id);
CREATE INDEX tickets_owner_created
  ON tickets(owner_id, created_at DESC, id);
CREATE UNIQUE INDEX tickets_one_per_order
  ON tickets(locked_by_order_id)
  WHERE locked_by_order_id IS NOT NULL;

CREATE TABLE inbox_messages (
  consumer TEXT NOT NULL,
  message_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL CHECK (event_version > 0),
  aggregate_id TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL CHECK (aggregate_version > 0),
  ticket_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'sold',
    'released',
    'already_sold',
    'already_available',
    'not_matching',
    'missing'
  )),
  processed_at INTEGER NOT NULL,
  PRIMARY KEY (consumer, message_id)
) STRICT;

CREATE INDEX inbox_messages_processed
  ON inbox_messages(processed_at, consumer, message_id);
CREATE INDEX inbox_messages_aggregate_diagnostics
  ON inbox_messages(aggregate_id, aggregate_version, processed_at);
