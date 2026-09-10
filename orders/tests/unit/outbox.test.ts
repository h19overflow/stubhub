import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { database, withTransaction } from "../../src/database.js";
import {
  enqueueOrderFact,
  claimDueOrderEventPublications,
  markOrderEventPublished,
  recordOrderEventPublicationFailure,
} from "../../src/messaging/outbox-repo.js";

test("Outbox stages an authoritative domain fact within a transaction", () => {
  const orderId = randomUUID();
  const correlationId = randomUUID();

  const pub = withTransaction(() => {
    return enqueueOrderFact({
      orderId,
      orderVersion: 1,
      eventType: "order:completed",
      eventVersion: 1,
      payload: {
        orderId,
        ticketId: randomUUID(),
        amountCents: 12500,
        currency: "USD",
      },
      correlationId,
    });
  });

  assert.equal(pub.aggregateId, orderId);
  assert.equal(pub.eventType, "order:completed");
  assert.equal(pub.correlationId, correlationId);
  assert.equal(pub.publishedAt, null);
  assert.equal(pub.attemptCount, 0);

  // Inspect database directly
  const row = database
    .prepare("SELECT * FROM order_event_publications WHERE id = ?")
    .get(pub.id) as { event_type: string; published_at: number | null };

  assert.ok(row);
  assert.equal(row.event_type, "order:completed");
  assert.equal(row.published_at, null);
});

test("Worker leasing atomically claims due publications and locks competing workers", () => {
  const orderId = randomUUID();
  const now = Date.now();

  const pub = withTransaction(() => {
    return enqueueOrderFact({
      orderId,
      orderVersion: 1,
      eventType: "order:expired",
      eventVersion: 1,
      payload: { orderId, ticketId: randomUUID() },
    });
  });

  // Worker 1 claims with a 30s lease
  const claimedByWorker1 = claimDueOrderEventPublications("worker-1", now, 10, 30_000);
  const ourPub = claimedByWorker1.find((p) => p.id === pub.id);
  assert.ok(ourPub, "Worker 1 must claim the due publication");
  assert.equal(ourPub.lockedBy, "worker-1");
  assert.ok(ourPub.lockedUntil);

  // Worker 2 attempts to claim at the same timestamp — must get nothing
  const claimedByWorker2 = claimDueOrderEventPublications("worker-2", now, 10, 30_000);
  const leakedToWorker2 = claimedByWorker2.find((p) => p.id === pub.id);
  assert.equal(leakedToWorker2, undefined, "Worker 2 must not claim an actively leased publication");

  // Advance time past the lease duration (now + 31s)
  const futureTime = now + 31_000;
  const claimedAfterExpiry = claimDueOrderEventPublications("worker-2", futureTime, 10, 30_000);
  const recoveredByWorker2 = claimedAfterExpiry.find((p) => p.id === pub.id);
  assert.ok(recoveredByWorker2, "Worker 2 must recover the publication after lease expiration");
  assert.equal(recoveredByWorker2.lockedBy, "worker-2");
});

test("Publish success marks row published and clears worker lock", () => {
  const orderId = randomUUID();
  const now = Date.now();

  const pub = withTransaction(() => {
    return enqueueOrderFact({
      orderId,
      orderVersion: 1,
      eventType: "order:completed",
      eventVersion: 1,
      payload: { orderId },
    });
  });

  claimDueOrderEventPublications("worker-1", now, 10, 30_000);
  const success = markOrderEventPublished(pub.id);
  assert.equal(success, true);

  const row = database
    .prepare("SELECT published_at, locked_by, locked_until FROM order_event_publications WHERE id = ?")
    .get(pub.id) as { published_at: number | null; locked_by: string | null; locked_until: number | null };

  assert.ok(row.published_at !== null, "published_at must be populated");
  assert.equal(row.locked_by, null, "locked_by must be cleared");
  assert.equal(row.locked_until, null, "locked_until must be cleared");
});

test("Publish failure applies exponential backoff delay and increments attempt count", () => {
  const orderId = randomUUID();
  const now = Date.now();

  const pub = withTransaction(() => {
    return enqueueOrderFact({
      orderId,
      orderVersion: 1,
      eventType: "order:completed",
      eventVersion: 1,
      payload: { orderId },
    });
  });

  const [claimed] = claimDueOrderEventPublications("worker-1", now, 10, 30_000);
  const failed = recordOrderEventPublicationFailure(claimed, "NATS connection timeout", now);
  assert.equal(failed, true);

  const row = database
    .prepare("SELECT attempt_count, next_attempt_at, last_error, locked_by FROM order_event_publications WHERE id = ?")
    .get(pub.id) as { attempt_count: number; next_attempt_at: number; last_error: string; locked_by: string | null };

  assert.equal(row.attempt_count, 1);
  assert.ok(row.next_attempt_at > now, "next_attempt_at must be scheduled in the future");
  assert.equal(row.last_error, "NATS connection timeout");
  assert.equal(row.locked_by, null, "Lock must be released on failure for future retry");
});
