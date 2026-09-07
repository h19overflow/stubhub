ALTER TABLE order_event_publications ADD COLUMN locked_by TEXT;
ALTER TABLE order_event_publications ADD COLUMN locked_until INTEGER;
ALTER TABLE order_event_publications ADD COLUMN correlation_id TEXT;

DROP INDEX IF EXISTS order_event_publications_due;

CREATE INDEX order_event_publications_due
  ON order_event_publications(next_attempt_at, locked_until, created_at, id)
  WHERE published_at IS NULL;
