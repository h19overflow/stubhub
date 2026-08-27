type InboxMessage = {
  consumer: string;
  messageId: string;
  processedAt: string;
};

type InboxMessageRow = {
  consumer: string;
  message_id: string;
  processed_at: number;
};

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
