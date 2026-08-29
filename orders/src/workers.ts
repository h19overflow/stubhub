import { createClient } from "redis";
import { processPurchase } from "./http/routes/create-order.js";
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
let running = false;

const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://redis:6379",
  socket: { connectTimeout: 1_000, reconnectStrategy: false },
});
redis.on("error", (error) => console.error("Orders Redis error", error));

async function scanPurchases(): Promise<void> {
  for (const operation of duePurchases(Date.now())) {
    await processPurchase(operation);
  }
}

function scanExpiration(): void {
  const now = Date.now();
  for (const id of duePending(now)) {
    enqueueTerminal(id, "order.expired", now);
  }
}

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

async function startWorkers(): Promise<void> {
  await scan();
  timer = setInterval(() => void scan(), intervalMs);
}

async function stopWorkers(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  while (running) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (redis.isOpen) await redis.quit();
}

export { startWorkers, stopWorkers };
