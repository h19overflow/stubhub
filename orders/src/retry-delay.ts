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

function retryDelayMs(persistedRetryCount: number): number {
  if (!Number.isSafeInteger(persistedRetryCount) || persistedRetryCount < 0) {
    throw new RangeError("Persisted retry count must be a non-negative safe integer");
  }

  const exponent = Math.min(
    persistedRetryCount,
    Math.ceil(Math.log2(retryCapMs / retryBaseMs)),
  );
  const ceiling = Math.min(retryCapMs, retryBaseMs * 2 ** exponent);
  const floor = Math.ceil(ceiling / 2);
  return floor + Math.floor(Math.random() * (ceiling - floor + 1));
}

export { retryDelayMs };
