export type RetryDelayOptions = {
  baseMs?: number;
  capMs?: number;
};

/**
 * Computes capped exponential backoff with uniform jitter (between half and all of the capped delay).
 * Desynchronizes competing workers and clients on transient failures.
 *
 * @param attemptCount - Non-negative number of failed attempts.
 * @param options - Configurable base delay (default: 2,000ms) and maximum ceiling (default: 300,000ms).
 */
export function computeRetryDelayMs(
  attemptCount: number,
  options?: RetryDelayOptions,
): number {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 0) {
    throw new RangeError("Attempt count must be a non-negative safe integer");
  }

  const baseMs = options?.baseMs ?? 2_000;
  const capMs = options?.capMs ?? 300_000;

  if (capMs < baseMs) {
    throw new Error("capMs must be greater than or equal to baseMs");
  }

  const exponent = Math.min(
    attemptCount,
    Math.ceil(Math.log2(capMs / baseMs)),
  );
  const ceiling = Math.min(capMs, baseMs * 2 ** exponent);
  const floor = Math.ceil(ceiling / 2);
  return floor + Math.floor(Math.random() * (ceiling - floor + 1));
}

export { computeRetryDelayMs as retryDelayMs };
