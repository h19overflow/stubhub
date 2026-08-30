/** Event data stays unknown until concrete, versioned event contracts are defined. */
type OrderEventPublicationPayload = unknown;

/** Application view of a durable outgoing event and its publication state. */
type OrderEventPublication = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  eventVersion: number;
  payload: OrderEventPublicationPayload;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  attemptCount: number;
  nextAttemptAt: string;
  lastError: string | null;
};

/** SQLite row shape before JSON and timestamps are converted for the application. */
type OrderEventPublicationRow = {
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
  next_attempt_at: number;
  last_error: string | null;
};

/**
 * Data needed when a business transaction records a fact for later publication.
 * Delivery bookkeeping starts with repository-controlled defaults.
 */
type EnqueueOrderEventPublicationInput = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  eventVersion: number;
  payload: OrderEventPublicationPayload;
};

function toOrderEventPublication(
  row: OrderEventPublicationRow,
): OrderEventPublication {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    eventType: row.event_type,
    eventVersion: row.event_version,
    payload: JSON.parse(row.payload) as OrderEventPublicationPayload,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    publishedAt: row.published_at === null ? null : new Date(row.published_at).toISOString(),
    nextAttemptAt: new Date(row.next_attempt_at).toISOString(),
    attemptCount: row.attempt_count,
    lastError: row.last_error,
  };
}

export { toOrderEventPublication };
export type {
  EnqueueOrderEventPublicationInput,
  OrderEventPublication,
  OrderEventPublicationPayload,
  OrderEventPublicationRow,
};
