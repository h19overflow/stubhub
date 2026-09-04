import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { database } from "../database.js";
import { retryDelayMs } from "../retry-delay.js";

/** Event data payload shape */
type OrderFactPayload = Record<string, unknown>;

/** Public domain input to stage an outbox fact */
type EnqueueOrderFactInput = {
  id?: string;
  orderId: string;
  orderVersion: number;
  eventType: string;
  eventVersion?: number;
  payload: OrderFactPayload;
};

/** Application representation of an outbox publication */
type OrderEventPublication = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  eventVersion: number;
  payload: OrderFactPayload;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  attemptCount: number;
  nextAttemptAt: string;
  lastError: string | null;
};

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

type RedisClientLike = {
  isOpen: boolean;
  connect(): Promise<unknown>;
  quit?(): Promise<unknown>;
  xAdd(key: string, id: string, message: Record<string, string>): Promise<string>;
};

const orderEventPublicationColumns = `
  id, aggregate_type, aggregate_id, aggregate_version,
  event_type, event_version, payload, created_at, updated_at,
  published_at, attempt_count, next_attempt_at, last_error
`;

function toPublication(row: OrderEventPublicationRow): OrderEventPublication {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    eventType: row.event_type,
    eventVersion: row.event_version,
    payload: JSON.parse(row.payload) as OrderFactPayload,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    publishedAt: row.published_at === null ? null : new Date(row.published_at).toISOString(),
    nextAttemptAt: new Date(row.next_attempt_at).toISOString(),
    attemptCount: row.attempt_count,
    lastError: row.last_error,
  };
}

let defaultRedis: ReturnType<typeof createClient> | null = null;

function getRedisClient(): RedisClientLike {
  if (!defaultRedis) {
    defaultRedis = createClient({
      url: process.env.REDIS_URL ?? "redis://redis:6379",
      socket: { connectTimeout: 1_000, reconnectStrategy: false },
    });
    defaultRedis.on("error", (error) =>
      console.error("Orders messaging publisher Redis error", error),
    );
  }
  return defaultRedis;
}

/**
 * [STAGE 1: STAGE]
 * Stages an authoritative domain fact into the outbox table.
 * Must run inside the SQLite transaction that made the state change.
 */
function enqueueOrderFact(input: EnqueueOrderFactInput): OrderEventPublication {
  const now = Date.now();
  const id = input.id ?? randomUUID();
  const payloadStr = JSON.stringify(input.payload);

  database.prepare(`
    INSERT INTO order_event_publications (
      id, aggregate_type, aggregate_id, aggregate_version,
      event_type, event_version, payload, created_at, updated_at, next_attempt_at
    ) VALUES (?, 'order', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
function listDueOrderEventPublications(now: number, limit: number): OrderEventPublication[] {
  const rows = database.prepare(`
    SELECT ${orderEventPublicationColumns}
    FROM order_event_publications
    WHERE published_at IS NULL AND next_attempt_at <= ?
    ORDER BY next_attempt_at, created_at, id
    LIMIT ?
  `).all(now, limit) as unknown as OrderEventPublicationRow[];
  return rows.map(toPublication);
}

/** Marks a row successfully published. */
function markOrderEventPublished(id: string): boolean {
  const now = Date.now();
  const result = database.prepare(`
    UPDATE order_event_publications
    SET published_at = ?, attempt_count = attempt_count + 1, updated_at = ?, last_error = NULL
    WHERE id = ? AND published_at IS NULL
  `).run(now, now, id);
  return Number(result.changes) === 1;
}

/** Records failure and applies exponential backoff. */
function recordOrderEventPublicationFailure(
  pub: OrderEventPublication,
  error: string,
  now: number,
): boolean {
  const result = database.prepare(`
    UPDATE order_event_publications
    SET attempt_count = attempt_count + 1, next_attempt_at = ?,
        last_error = ?, updated_at = ?
    WHERE id = ? AND published_at IS NULL AND attempt_count = ?
  `).run(
    now + retryDelayMs(pub.attemptCount),
    error.slice(0, 500),
    now,
    pub.id,
    pub.attemptCount,
  );
  return Number(result.changes) === 1;
}

/**
 * Dispatches a single publication row to Redis Streams.
 */
async function dispatchOutboxPublication(
  pub: OrderEventPublication,
  redis?: RedisClientLike,
): Promise<void> {
  const client = redis ?? getRedisClient();
  const envelope = {
    messageId: pub.id,
    eventType: pub.eventType,
    eventVersion: pub.eventVersion,
    aggregateType: pub.aggregateType,
    aggregateId: pub.aggregateId,
    aggregateVersion: pub.aggregateVersion,
    occurredAt: pub.createdAt,
    payload: pub.payload,
  };

  try {
    await client.xAdd("orders.events", "*", { event: JSON.stringify(envelope) });
    markOrderEventPublished(pub.id);
  } catch (err) {
    recordOrderEventPublicationFailure(
      pub,
      err instanceof Error ? err.message : "publication failed",
      Date.now(),
    );
  }
}

/**
 * [STAGE 2: DISPATCH]
 * Polls due outbox records and dispatches them to Redis Streams.
 * Lazily connects to Redis and handles transient failures.
 */
async function dispatchDueOrderEvents(
  limitOrRedis?: number | RedisClientLike,
  maybeLimit?: number,
): Promise<number> {
  const redis: RedisClientLike =
    typeof limitOrRedis === "object" && limitOrRedis !== null
      ? limitOrRedis
      : getRedisClient();
  const limit: number =
    typeof limitOrRedis === "number"
      ? limitOrRedis
      : typeof maybeLimit === "number"
        ? maybeLimit
        : 100;

  const now = Date.now();
  const publications = listDueOrderEventPublications(now, limit);
  if (publications.length === 0) return 0;

  if (!redis.isOpen) {
    try {
      await redis.connect();
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Redis connection failed";
      for (const pub of publications) {
        recordOrderEventPublicationFailure(pub, reason, now);
      }
      return 0;
    }
  }

  for (const pub of publications) {
    await dispatchOutboxPublication(pub, redis);
  }
  return publications.length;
}

/** Closes Redis transport on process shutdown. */
async function closeOrderMessaging(): Promise<void> {
  if (defaultRedis?.isOpen) {
    await defaultRedis.quit();
  }
  defaultRedis = null;
}

export {
  enqueueOrderFact,
  dispatchDueOrderEvents,
  closeOrderMessaging,
  // Escape hatches for drills or tests
  dispatchDueOrderEvents as dispatchOutboxBatch,
  dispatchOutboxPublication,
  listDueOrderEventPublications,
  markOrderEventPublished,
  recordOrderEventPublicationFailure,
};
export type {
  EnqueueOrderFactInput,
  OrderEventPublication,
  RedisClientLike,
};
