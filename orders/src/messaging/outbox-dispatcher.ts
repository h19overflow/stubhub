/**
 * [STAGE 2: DISPATCH] Outbox Dispatcher
 *
 * Scans the durable order_event_publications outbox ledger in SQLite and
 * dispatches due events to Redis Streams ("orders.events").
 *
 * Sequence:
 * 1. Read bounded batch of unpublished rows whose next_attempt_at <= now
 * 2. Transport event to Redis using XADD with envelope format
 * 3. On success: mark publication row published (published_at = now)
 * 4. On failure: record error and schedule exponential backoff attempt
 */

import type { createClient } from "redis";
import {
  listDueOrderEventPublications,
  markOrderEventPublished,
  recordOrderEventPublicationFailure,
} from "./order-event-publication-repo.js";
import type { OrderEventPublication } from "./order-event-publication.js";

type RedisClient = {
  isOpen: boolean;
  connect(): Promise<unknown>;
  xAdd(
    key: string,
    id: string,
    message: Record<string, string>,
  ): Promise<string>;
};

/**
 * Dispatches a single outbox record to Redis Streams and updates its durable state.
 *
 * Redis XADD occurs before the row is marked published. A crash between XADD
 * and SQLite update causes duplicate delivery on restart, which downstream
 * consumers deduplicate via their processed-event ledger (inbox pattern).
 */
async function dispatchOutboxPublication(
  publication: OrderEventPublication,
  redis: RedisClient,
): Promise<void> {
  const envelope = {
    messageId: publication.id,
    eventType: publication.eventType,
    eventVersion: publication.eventVersion,
    aggregateType: publication.aggregateType,
    aggregateId: publication.aggregateId,
    aggregateVersion: publication.aggregateVersion,
    occurredAt: publication.createdAt,
    payload: publication.payload,
  };

  try {
    await redis.xAdd("orders.events", "*", {
      event: JSON.stringify(envelope),
    });
    markOrderEventPublished(publication.id);
  } catch (error) {
    recordOrderEventPublicationFailure(
      publication,
      error instanceof Error ? error.message : "publication failed",
      Date.now(),
    );
  }
}

/**
 * Polls for a batch of due unpublished outbox records and dispatches them.
 * Connects to Redis lazily if disconnected.
 */
async function dispatchOutboxBatch(
  redis: RedisClient,
  limit = 100,
): Promise<void> {
  const now = Date.now();
  const publications = listDueOrderEventPublications(now, limit);
  if (publications.length === 0) return;

  if (!redis.isOpen) {
    try {
      await redis.connect();
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Redis connection failed";
      for (const publication of publications) {
        recordOrderEventPublicationFailure(publication, reason, now);
      }
      return;
    }
  }

  for (const publication of publications) {
    await dispatchOutboxPublication(publication, redis);
  }
}

export { dispatchOutboxBatch, dispatchOutboxPublication };
