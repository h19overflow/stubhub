import { randomUUID } from "node:crypto";
import { database } from "../database.js";
import { retryDelayMs } from "../retry-delay.js";
import type {
  EnqueueOrderFactInput,
  OrderEventPublication,
  OrderEventPublicationRow,
  OrderFactPayload,
} from "./types.js";

const orderEventPublicationColumns = `
  id, aggregate_type, aggregate_id, aggregate_version,
  event_type, event_version, payload, created_at, updated_at,
  published_at, attempt_count, next_attempt_at, last_error
`;

function parsePayload(raw: string): OrderFactPayload {
  try {
    return JSON.parse(raw) as OrderFactPayload;
  } catch {
    return {};
  }
}

function toPublication(row: OrderEventPublicationRow): OrderEventPublication {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    eventType: row.event_type,
    eventVersion: row.event_version,
    payload: parsePayload(row.payload),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    publishedAt:
      row.published_at === null
        ? null
        : new Date(row.published_at).toISOString(),
    nextAttemptAt: new Date(row.next_attempt_at).toISOString(),
    attemptCount: row.attempt_count,
    lastError: row.last_error,
  };
}

/**
 * [STAGE 1: STAGE]
 * Stages an authoritative domain fact into the outbox table.
 * Must run inside the SQLite transaction that made the state change.
 */
export function enqueueOrderFact(
  input: EnqueueOrderFactInput,
): OrderEventPublication {
  const now = Date.now();
  const id = input.id ?? randomUUID();
  const payloadStr = JSON.stringify(input.payload);

  database
    .prepare(`
    INSERT INTO order_event_publications (
      id, aggregate_type, aggregate_id, aggregate_version,
      event_type, event_version, payload, created_at, updated_at, next_attempt_at
    ) VALUES (?, 'order', ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      id,
      input.orderId,
      input.orderVersion,
      input.eventType,
      input.eventVersion ?? 1,
      payloadStr,
      now,
      now,
      now,
    );

  return {
    id,
    aggregateType: "order",
    aggregateId: input.orderId,
    aggregateVersion: input.orderVersion,
    eventType: input.eventType,
    eventVersion: input.eventVersion ?? 1,
    payload: input.payload,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    publishedAt: null,
    attemptCount: 0,
    nextAttemptAt: new Date(now).toISOString(),
    lastError: null,
  };
}

/** Reads due rows from the database. */
export function listDueOrderEventPublications(
  now: number,
  limit: number,
): OrderEventPublication[] {
  // SAFETY: query columns match orderEventPublicationColumns and OrderEventPublicationRow shape
  const rows = database
    .prepare(`
    SELECT ${orderEventPublicationColumns}
    FROM order_event_publications
    WHERE published_at IS NULL AND next_attempt_at <= ?
    ORDER BY next_attempt_at, created_at, id
    LIMIT ?
  `)
    .all(now, limit) as unknown as OrderEventPublicationRow[];
  return rows.map(toPublication);
}

/** Marks a row successfully published. */
export function markOrderEventPublished(id: string): boolean {
  const now = Date.now();
  const result = database
    .prepare(`
    UPDATE order_event_publications
    SET published_at = ?, attempt_count = attempt_count + 1, updated_at = ?, last_error = NULL
    WHERE id = ? AND published_at IS NULL
  `)
    .run(now, now, id);
  return Number(result.changes) === 1;
}

/** Records failure and applies exponential backoff. */
export function recordOrderEventPublicationFailure(
  pub: OrderEventPublication,
  error: string,
  now: number,
): boolean {
  const result = database
    .prepare(`
    UPDATE order_event_publications
    SET attempt_count = attempt_count + 1, next_attempt_at = ?,
        last_error = ?, updated_at = ?
    WHERE id = ? AND published_at IS NULL AND attempt_count = ?
  `)
    .run(
      now + retryDelayMs(pub.attemptCount),
      error.slice(0, 500),
      now,
      pub.id,
      pub.attemptCount,
    );
  return Number(result.changes) === 1;
}
