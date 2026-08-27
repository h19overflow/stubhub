/**
 * Durable proof that one consumer has claimed a message ID.
 *
 * The `(consumer, messageId)` pair is the idempotency key: another consumer may
 * handle the same message, but the same consumer should not apply it twice.
 */
type InboxMessage = {
  consumer: string;
  messageId: string;
  processedAt: string;
};

/** SQLite row shape before timestamps and column names are converted for the application. */
type InboxMessageRow = {
  consumer: string;
  message_id: string;
  processed_at: number;
};

/** Whether this call created the marker or found one from an earlier delivery. */
type RecordInboxMessageResult =
  | { outcome: "recorded"; message: InboxMessage }
  | { outcome: "duplicate"; message: InboxMessage };

function toInboxMessage(row: InboxMessageRow): InboxMessage {
  return {
    consumer: row.consumer,
    messageId: row.message_id,
    processedAt: new Date(row.processed_at).toISOString(),
  };
}

export { toInboxMessage };
export type { InboxMessage, InboxMessageRow, RecordInboxMessageResult };
