import { database } from "../database.js";
import { toOutboxMessage } from "./outbox-message.js";
import type {
  EnqueueOutboxMessageInput,
  OutboxMessage,
  OutboxMessageRow,
} from "./outbox-message.js";

const outboxColumns = `
  id,
  aggregate_type,
  aggregate_id,
  aggregate_version,
  event_type,
  event_version,
  payload,
  created_at,
  updated_at,
  published_at,
  attempt_count,
  last_error
`;

/**
 * Stores a business fact for later publication.
 *
 * Call this in the same database transaction as the Order change that produced
 * the fact. The publisher can then retry without losing a committed event.
 */
function enqueueOutboxMessage(input: EnqueueOutboxMessageInput): OutboxMessage {
  const now = Date.now();
  const payload = JSON.stringify(input.payload);
  if (payload === undefined) throw new TypeError("Outbox payload must be JSON serializable");
  database.prepare(`
    INSERT INTO outbox_messages (
      id,
      aggregate_type,
      aggregate_id,
      aggregate_version,
      event_type,
      event_version,
      payload,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.aggregateType,
    input.aggregateId,
    input.aggregateVersion,
    input.eventType,
    input.eventVersion,
    payload,
    now,
    now,
  );

  return {
    ...input,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    publishedAt: null,
    attemptCount: 0,
    lastError: null,
  };
}

/** Returns the oldest unpublished rows for one publisher batch. */
function listUnpublishedOutboxMessages(limit: number): OutboxMessage[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError("Outbox batch limit must be a positive safe integer");
  }

  const rows = database.prepare(`
    SELECT ${outboxColumns}
    FROM outbox_messages
    WHERE published_at IS NULL
    ORDER BY created_at, id
    LIMIT ?
  `).all(limit) as unknown as OutboxMessageRow[];
  return rows.map(toOutboxMessage);
}

/**
 * Records a successful publish attempt.
 * Returns false when the row is missing or another attempt already marked it.
 */
function markOutboxMessagePublished(id: string): boolean {
  const now = Date.now();
  const result = database.prepare(`
    UPDATE outbox_messages
    SET published_at = ?, attempt_count = attempt_count + 1, updated_at = ?, last_error = NULL
    WHERE id = ? AND published_at IS NULL
  `).run(now, now, id);
  return Number(result.changes) === 1;
}

/**
 * Keeps a failed message unpublished while recording retry diagnostics.
 * Returns false when the row is missing or was already published.
 */
function recordOutboxMessageFailure(id: string, error: string): boolean {
  const result = database.prepare(`
    UPDATE outbox_messages
    SET attempt_count = attempt_count + 1, last_error = ?, updated_at = ?
    WHERE id = ? AND published_at IS NULL
  `).run(error, Date.now(), id);
  return Number(result.changes) === 1;
}

export {
  enqueueOutboxMessage,
  listUnpublishedOutboxMessages,
  markOutboxMessagePublished,
  recordOutboxMessageFailure,
};
