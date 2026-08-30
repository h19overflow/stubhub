ALTER TABLE outbox_messages RENAME TO order_event_publications;

DROP INDEX outbox_messages_due;

CREATE INDEX order_event_publications_due
  ON order_event_publications(next_attempt_at, created_at, id)
  WHERE published_at IS NULL;
