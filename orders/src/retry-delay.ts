function positiveIntegerSetting(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const retryBaseMs = positiveIntegerSetting("ORDERS_RETRY_BASE_MS", 2_000);
const retryCapMs = positiveIntegerSetting("ORDERS_RETRY_CAP_MS", 5 * 60_000);
if (retryCapMs < retryBaseMs) {
  throw new Error("ORDERS_RETRY_CAP_MS must be at least ORDERS_RETRY_BASE_MS");
}

import { computeRetryDelayMs } from "@stubhub/common";

/**
 * Computes capped exponential backoff with uniform jitter for Orders outbox retries.
 */
function retryDelayMs(persistedRetryCount: number): number {
  return computeRetryDelayMs(persistedRetryCount, {
    baseMs: retryBaseMs,
    capMs: retryCapMs,
  });
}

export { retryDelayMs };
