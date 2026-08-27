import { database } from "../database.js";
import { toInboxMessage } from "./inbox-message.js";
import type { InboxMessageRow, RecordInboxMessageResult } from "./inbox-message.js";

/**
 * Atomically inserts or detects one consumer's idempotency marker.
 *
 * A message handler must call this in the same database transaction as its
 * business update. Otherwise a crash can record the marker without doing the
 * work, causing a later delivery to be mistaken for a safely handled duplicate.
 */
function recordInboxMessage(consumer: string, messageId: string): RecordInboxMessageResult {
  const result = database.prepare(`
    INSERT INTO inbox_messages (consumer, message_id, processed_at)
    VALUES (?, ?, ?)
    ON CONFLICT (consumer, message_id) DO NOTHING
  `).run(consumer, messageId, Date.now());

  const row = database.prepare(`
    SELECT consumer, message_id, processed_at
    FROM inbox_messages
    WHERE consumer = ? AND message_id = ?
  `).get(consumer, messageId) as InboxMessageRow | undefined;
  if (!row) throw new Error("Inbox marker could not be read");

  return {
    outcome: Number(result.changes) === 1 ? "recorded" : "duplicate",
    message: toInboxMessage(row),
  };
}

export { recordInboxMessage };
