CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'payment_processing', 'complete', 'expired')),
  expires_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, idempotency_key)
) STRICT;

CREATE INDEX orders_buyer_history
  ON orders(user_id, created_at DESC, id)
  WHERE status IN ('pending', 'payment_processing', 'complete');
