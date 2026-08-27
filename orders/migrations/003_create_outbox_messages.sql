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
  last_error TEXT,
  UNIQUE (aggregate_type, aggregate_id, aggregate_version, event_type, event_version)
) STRICT;

CREATE INDEX outbox_messages_unpublished
  ON outbox_messages(created_at, id)
  WHERE published_at IS NULL;
