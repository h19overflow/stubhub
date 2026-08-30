import { database } from "../database.js";
import { retryDelayMs } from "../retry-delay.js";
import { toOrderEventPublication } from "./order-event-publication.js";
import type {
  EnqueueOrderEventPublicationInput,
  OrderEventPublication,
  OrderEventPublicationRow,
} from "./order-event-publication.js";

const orderEventPublicationColumns = `
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
  next_attempt_at,
  last_error
`;

/**
 * Stores a business fact for later publication.
 *
 * Call this in the same database transaction as the Order change that produced
 * the fact. The inserted row starts unpublished and immediately due, so the
 * publisher can retry it without losing a committed event.
 */
function enqueueOrderEventPublication(
  input: EnqueueOrderEventPublicationInput,
): OrderEventPublication {
  const now = Date.now();
  const payload = JSON.stringify(input.payload);
  if (payload === undefined) {
    throw new TypeError("Order event publication payload must be JSON serializable");
  }
  database.prepare(`
    INSERT INTO order_event_publications (
      id,
      aggregate_type,
      aggregate_id,
      aggregate_version,
      event_type,
      event_version,
      payload,
      created_at,
      updated_at,
      next_attempt_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    now,
  );

  return {
    ...input,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    publishedAt: null,
    attemptCount: 0,
    nextAttemptAt: new Date(now).toISOString(),
    lastError: null,
  };
}

/**
 * Returns a stable, ordered batch of unpublished rows whose next attempt is due.
 *
 * Only rows still lacking published_at are selected, so a publisher restart can
 * reread durable work; the positive limit bounds one scan.
 */
function listDueOrderEventPublications(
  now: number,
  limit: number,
): OrderEventPublication[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError(
      "Order event publication batch limit must be a positive safe integer",
    );
  }

  const rows = database.prepare(`
    SELECT ${orderEventPublicationColumns}
    FROM order_event_publications
    WHERE published_at IS NULL AND next_attempt_at <= ?
    ORDER BY next_attempt_at, created_at, id
    LIMIT ?
  `).all(now, limit) as unknown as OrderEventPublicationRow[];
  return rows.map(toOrderEventPublication);
}

/**
 * Marks a publication row published after its Redis publication succeeds.
 *
 * The unpublished condition is compare-and-set protection against a duplicate
 * publisher. Returns true only when this call changed one row, and false when
 * the row is missing or already published.
 */
function markOrderEventPublished(id: string): boolean {
  const now = Date.now();
  const result = database.prepare(`
    UPDATE order_event_publications
    SET published_at = ?, attempt_count = attempt_count + 1, updated_at = ?, last_error = NULL
    WHERE id = ? AND published_at IS NULL
  `).run(now, now, id);
  return Number(result.changes) === 1;
}

/**
 * Records a failed publication and schedules the same row for a later attempt.
 *
 * The update is compare-and-set guarded by the row's observed attempt count and
 * unpublished state. Returns true only when retry metadata was recorded; false
 * means another publisher changed or published the row first.
 */
function recordOrderEventPublicationFailure(
  publication: OrderEventPublication,
  error: string,
  now: number,
): boolean {
  const result = database.prepare(`
    UPDATE order_event_publications
    SET attempt_count = attempt_count + 1, next_attempt_at = ?,
        last_error = ?, updated_at = ?
    WHERE id = ? AND published_at IS NULL AND attempt_count = ?
  `).run(
    now + retryDelayMs(publication.attemptCount),
    error.slice(0, 500),
    now,
    publication.id,
    publication.attemptCount,
  );
  return Number(result.changes) === 1;
}

export {
  enqueueOrderEventPublication,
  listDueOrderEventPublications,
  markOrderEventPublished,
  recordOrderEventPublicationFailure,
};
