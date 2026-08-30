ALTER TABLE inbox_messages RENAME TO processed_order_events;

DROP INDEX inbox_messages_processed;
CREATE INDEX processed_order_events_processed
  ON processed_order_events(processed_at, consumer, message_id);

DROP INDEX inbox_messages_aggregate_diagnostics;
CREATE INDEX processed_order_events_aggregate_diagnostics
  ON processed_order_events(aggregate_id, aggregate_version, processed_at);
