/** Event data stays unknown until concrete, versioned event contracts are defined. */
type OutboxPayload = unknown;

/** Application view of a durable outgoing event and its publication state. */
type OutboxMessage = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  eventVersion: number;
  payload: OutboxPayload;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  attemptCount: number;
  lastError: string | null;
};

/** SQLite row shape before JSON and timestamps are converted for the application. */
type OutboxMessageRow = {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  event_type: string;
  event_version: number;
  payload: string;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  attempt_count: number;
  last_error: string | null;
};

/**
 * Data needed when a business transaction records a fact for later publication.
 * Delivery bookkeeping starts with repository-controlled defaults.
 */
type EnqueueOutboxMessageInput = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  eventVersion: number;
  payload: OutboxPayload;
};

function toOutboxMessage(row: OutboxMessageRow): OutboxMessage {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    eventType: row.event_type,
    eventVersion: row.event_version,
    payload: JSON.parse(row.payload) as OutboxPayload,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    publishedAt: row.published_at === null ? null : new Date(row.published_at).toISOString(),
    attemptCount: row.attempt_count,
    lastError: row.last_error,
  };
}

export { toOutboxMessage };
export type { EnqueueOutboxMessageInput, OutboxMessage, OutboxMessageRow, OutboxPayload };
