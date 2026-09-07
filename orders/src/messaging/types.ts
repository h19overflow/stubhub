import type { Stan } from "node-nats-streaming";

/** Event data payload shape */
export type OrderFactPayload = Record<string, unknown>;

/** Public domain input to stage an outbox fact */
export type EnqueueOrderFactInput = {
  id?: string;
  orderId: string;
  orderVersion: number;
  eventType: string;
  eventVersion?: number;
  payload: OrderFactPayload;
  correlationId?: string;
};

/** Application representation of an outbox publication */
export type OrderEventPublication = {
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
  lockedBy?: string | null;
  lockedUntil?: string | null;
  correlationId?: string | null;
};

export type OrderEventPublicationRow = {
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
  locked_by: string | null;
  locked_until: number | null;
  correlation_id: string | null;
};

/** Backwards-compatible client type alias */
export type RedisClientLike = Stan;
