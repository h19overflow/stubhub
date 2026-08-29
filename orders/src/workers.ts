/**
 * Background work for the Orders service.
 *
 * HTTP routes handle the immediate request and store durable state. This file
 * repeatedly asks the Orders database what unfinished work is due and moves it
 * forward without requiring the browser to stay connected.
 *
 * Each scan performs four jobs:
 * 1. retry unfinished ticket reservations;
 * 2. reconcile payment attempts with the local provider;
 * 3. expire unpaid pending orders;
 * 4. publish committed Order events to Redis for the Tickets service.
 *
 * The database is the source of truth. The timer only wakes the worker up; a
 * restart is safe because the next scan reads the durable work again.
 */

import { createClient } from "redis";
import { processPurchase } from "./orders/purchase-workflow.js";
import {
  duePending,
  duePurchases,
  enqueueTerminal,
  findOrderRow,
} from "./orders/order-repo.js";
import {
  dueAttempts,
  resolveAttempt,
  scheduleAttempt,
  updateProviderReference,
} from "./payments/payment-attempt-repo.js";
import type { PaymentAttemptRow } from "./payments/payment-attempt.js";
import { lookup, submit } from "./payments/local-provider.js";
import {
  listUnpublishedOutboxMessages,
  markOutboxMessagePublished,
  recordOutboxMessageFailure,
} from "./messaging/outbox-repo.js";
import type { OutboxMessage } from "./messaging/outbox-message.js";

// Read worker timing from the environment once during service startup.
function positiveIntegerSetting(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

// `running` prevents a slow scan from overlapping the next timer tick.
const intervalMs = positiveIntegerSetting("ORDERS_WORKER_INTERVAL_MS", 2_000);
let timer: NodeJS.Timeout | null = null;
let running = false;

// Redis carries completed/expired Order facts to the Tickets consumer.
// The connection is opened lazily only when an outbox message needs publishing.
const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://redis:6379",
  socket: { connectTimeout: 1_000, reconnectStrategy: false },
});
redis.on("error", (error) => console.error("Orders Redis error", error));

// Continue reservation work that an HTTP request could not finish immediately.
async function scanPurchases(): Promise<void> {
  for (const operation of duePurchases(Date.now())) {
    await processPurchase(operation);
  }
}

// Turn overdue pending Orders into expired Orders and durable outbox events.
function scanExpiration(): void {
  const now = Date.now();
  for (const id of duePending(now)) {
    enqueueTerminal(id, "order.expired", now);
  }
}

// Reconcile processing payments. The persisted attempt ID makes provider
// lookup/submission safe to repeat after a crash or temporary failure.
function providerResult(attempt: PaymentAttemptRow, now: number) {
  try {
    return lookup(attempt.id, now);
  } catch {
    const order = findOrderRow(attempt.order_id);
    if (!order) throw new Error("payment order missing");
    return submit(
      attempt.id,
      attempt.provider_scenario,
      order.amount_cents,
      order.currency,
      now,
    );
  }
}

function reconcilePayment(attempt: PaymentAttemptRow): void {
  try {
    const now = Date.now();
    const provider = providerResult(attempt, now);
    if (!updateProviderReference(attempt, provider.reference, now)) return;
    if (provider.status !== "processing") {
      resolveAttempt(
        attempt.id,
        provider.status === "succeeded" ? "succeeded" : "declined",
        provider.reference,
        provider.failureCode,
        now,
      );
    }
  } catch (error) {
    scheduleAttempt(
      attempt,
      error instanceof Error ? error.message : "provider reconciliation failed",
      Date.now(),
    );
  }
}

function scanPayments(): void {
  for (const attempt of dueAttempts(Date.now())) {
    reconcilePayment(attempt);
  }
}

// Publish one durable outbox row to Redis. The database row is marked published
// only after Redis accepts it, so a failed publish remains available for retry.
async function publishMessage(message: OutboxMessage): Promise<void> {
  const envelope = {
    messageId: message.id,
    eventType: message.eventType,
    eventVersion: message.eventVersion,
    aggregateType: message.aggregateType,
    aggregateId: message.aggregateId,
    aggregateVersion: message.aggregateVersion,
    occurredAt: message.createdAt,
    payload: message.payload,
  };
  try {
    await redis.xAdd("orders.events", "*", {
      event: JSON.stringify(envelope),
    });
    markOutboxMessagePublished(message.id);
  } catch (error) {
    recordOutboxMessageFailure(
      message,
      error instanceof Error ? error.message : "publish failed",
      Date.now(),
    );
  }
}

// Publish a bounded batch of due outbox rows. Tickets consumes these events to
// mark its matching reservation sold or release it after expiration.
async function scanOutbox(): Promise<void> {
  const now = Date.now();
  const messages = listUnpublishedOutboxMessages(now, 100);
  if (messages.length === 0) return;

  if (!redis.isOpen) {
    try {
      await redis.connect();
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Redis connection failed";
      for (const message of messages) {
        recordOutboxMessageFailure(message, reason, now);
      }
      return;
    }
  }

  for (const message of messages) {
    await publishMessage(message);
  }
}

// Run every background responsibility once. One failure is logged, and the
// interval can try the remaining durable work again on the next scan.
async function scan(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await scanPurchases();
    scanPayments();
    scanExpiration();
    await scanOutbox();
  } catch (error) {
    console.error("Orders worker scan failed", error);
  } finally {
    running = false;
  }
}

// Orders calls this before opening its HTTP listener, so recovery begins as the
// service starts rather than waiting for the first interval.
async function startWorkers(): Promise<void> {
  await scan();
  timer = setInterval(() => void scan(), intervalMs);
}

// Shutdown stops new scans, waits for the active scan, then closes Redis.
async function stopWorkers(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  while (running) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (redis.isOpen) await redis.quit();
}

export { startWorkers, stopWorkers };
