import { randomBytes } from "node:crypto";
import type { Stan } from "node-nats-streaming";
// pi-lens-ignore: ts:2305
import { Subjects } from "@stubhub/common";
import { getNatsClient } from "./nats-client.js";
import {
  OrderCompletedPublisher,
  OrderExpiredPublisher,
} from "./publishers/index.js";
import {
  claimDueOrderEventPublications,
  markOrderEventPublished,
  recordOrderEventPublicationFailure,
} from "./outbox-repo.js";
import type { OrderEventPublication } from "./types.js";

const defaultWorkerId =
  process.env.HOSTNAME ??
  `orders-worker-${process.pid}-${randomBytes(3).toString("hex")}`;

/**
 * Dispatches a single publication row to NATS Streaming via typed Publishers.
 */
export async function dispatchOutboxPublication(
  pub: OrderEventPublication,
  stan?: Stan,
): Promise<void> {
  try {
    const client = stan ?? (await getNatsClient());
    const ticketId =
      typeof pub.payload.ticketId === "string" ? pub.payload.ticketId : "";
    const eventData = {
      id: pub.aggregateId,
      version: pub.aggregateVersion,
      messageId: pub.id,
      ticketId,
      ticket: { id: ticketId },
      occurredAt: pub.createdAt,
      correlationId: pub.correlationId ?? undefined,
    };

    if (pub.eventType === Subjects.OrderCompleted) {
      // pi-lens-ignore: ts:2554
      const publisher = new OrderCompletedPublisher(client);
      // pi-lens-ignore: ts:2339
      await publisher.publish(eventData);
    } else if (pub.eventType === Subjects.OrderExpired) {
      // pi-lens-ignore: ts:2554
      const publisher = new OrderExpiredPublisher(client);
      // pi-lens-ignore: ts:2339
      await publisher.publish(eventData);
    } else {
      throw new Error(
        `Unsupported event type for NATS dispatch: ${pub.eventType}`,
      );
    }

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
 * Polls due outbox records and dispatches them via NATS Streaming.
 * Lazily connects to NATS and handles transient failures.
 */
export type DispatchDueOrderEventsOptions = {
  limit?: number;
  stan?: Stan;
};

export async function dispatchDueOrderEvents(
  optionsOrLimit?: number | DispatchDueOrderEventsOptions,
): Promise<number> {
  let stan: Stan | undefined;
  let limit = 100;

  if (typeof optionsOrLimit === "number") {
    limit = optionsOrLimit;
  } else if (optionsOrLimit) {
    limit = optionsOrLimit.limit ?? 100;
    stan = optionsOrLimit.stan;
  }
  const now = Date.now();
  const publications = claimDueOrderEventPublications(defaultWorkerId, now, limit);
  if (publications.length === 0) return 0;

  let client: Stan;
  try {
    client = stan ?? (await getNatsClient());
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "NATS connection failed";
    for (const pub of publications) {
      recordOrderEventPublicationFailure(pub, reason, now);
    }
    return 0;
  }

  for (const pub of publications) {
    await dispatchOutboxPublication(pub, client);
  }
  return publications.length;
}
