ALTER TABLE outbox_messages RENAME TO outbox_messages_legacy;

CREATE TABLE outbox_messages (
  id TEXT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL CHECK (aggregate_version > 0),
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL CHECK (event_version > 0),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  UNIQUE (aggregate_type, aggregate_id, aggregate_version, event_type, event_version)
) STRICT;

INSERT INTO outbox_messages (
  id, aggregate_type, aggregate_id, aggregate_version, event_type, event_version,
  payload, created_at, updated_at, published_at, attempt_count, next_attempt_at, last_error
)
SELECT id, aggregate_type, aggregate_id, aggregate_version, event_type, event_version,
       payload, created_at, updated_at, published_at, attempt_count, created_at, last_error
FROM outbox_messages_legacy;

DROP TABLE outbox_messages_legacy;

CREATE INDEX outbox_messages_due
  ON outbox_messages(next_attempt_at, created_at, id)
  WHERE published_at IS NULL;
