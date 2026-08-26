CREATE TABLE tickets (
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
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'sold')),
  locked_by_order_id TEXT,
  lock_expires_at INTEGER,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (owner_id, idempotency_key)
) STRICT;

CREATE INDEX tickets_available_discovery
  ON tickets(status, event_starts_at, id);

CREATE INDEX tickets_owner_created
  ON tickets(owner_id, created_at DESC, id);
