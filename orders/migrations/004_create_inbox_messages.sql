CREATE TABLE inbox_messages (
  consumer TEXT NOT NULL,
  message_id TEXT NOT NULL,
  processed_at INTEGER NOT NULL,
  PRIMARY KEY (consumer, message_id)
) STRICT;

CREATE INDEX inbox_messages_processed
  ON inbox_messages(processed_at, consumer, message_id);
