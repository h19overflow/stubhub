import { app } from "./app.js";
import { startWorkers, stopWorkers } from "./workers.js";

function positiveIntegerSetting(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const port = positiveIntegerSetting("PORT", 3003);

await startWorkers();
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Orders service listening on port ${port}`);
});

let stopping = false;

/**
 * Shuts down the Orders service in HTTP-first order, then drains workers and
 * closes Redis.
 *
 * The guard makes repeated signal-triggered calls no-ops, so only the first
 * shutdown sequence closes the server and waits for background work to finish.
 */
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await stopWorkers();
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void stop().then(
      () => process.exit(0),
      (error) => {
        console.error("Orders shutdown failed", error);
        process.exit(1);
      },
    );
  });
}
