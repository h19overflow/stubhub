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
  progressPaymentAttempt,
  scheduleAttempt,
} from "./payments/payment-attempt-repo.js";
import type { PaymentAttemptRow } from "./payments/payment-attempt.js";
import { lookup, submit } from "./payments/local-provider.js";
import { dispatchOutboxBatch } from "./messaging/outbox-dispatcher.js";

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

const intervalMs = positiveIntegerSetting("ORDERS_WORKER_INTERVAL_MS", 2_000);
let timer: NodeJS.Timeout | null = null;
// `running` means one scan is executing in this process. It prevents overlapping
// scans and lets shutdown wait for active work; it does not represent durable work.
let running = false;

// Redis carries completed/expired Order facts to the Tickets service.
// The connection is opened lazily only when a stored event is due for publication.
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

// Turn overdue pending Orders into expired Orders and durable event publications.
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
    progressPaymentAttempt(attempt, provider, now);
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

/**
 * [STAGE 2: DISPATCH]
 * Invokes the outbox dispatcher to send pending order events to Redis Streams.
 */
async function scanOrderEventPublications(): Promise<void> {
  await dispatchOutboxBatch(redis);
}

/**
 * Runs each durable worker scan without overlapping a previous iteration.
 *
 * An interrupted scan leaves unfinished state in its owning database; a later
 * invocation rereads that state. A failure is logged so the recurring scan can
 * retry work that was not reached.
 */
async function scan(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await scanPurchases();
    scanPayments();
    scanExpiration();
    await scanOrderEventPublications();
  } catch (error) {
    console.error("Orders worker scan failed", error);
  } finally {
    running = false;
  }
}

/**
 * Performs one recovery scan before installing the recurring worker timer.
 *
 * Awaiting the first scan makes an Orders restart inspect already-due durable
 * work immediately instead of leaving it idle until the first interval.
 */
async function startWorkers(): Promise<void> {
  await scan();
  timer = setInterval(() => void scan(), intervalMs);
}

/**
 * Stops future scans, waits for the active scan, then closes Redis.
 *
 * Graceful shutdown narrows the uncertain publish window. An abrupt shutdown
 * remains recoverable because unpublished rows and stable message IDs are
 * durable rather than process-local.
 */
async function stopWorkers(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  while (running) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (redis.isOpen) await redis.quit();
}

export { startWorkers, stopWorkers };
