import { app } from "./app.js";

function positiveIntegerSetting(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const port = positiveIntegerSetting("PORT", 3004);
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Moderation service listening on port ${port}`);
});

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void stop().then(
      () => process.exit(0),
      (error) => {
        console.error("Moderation shutdown failed", error);
        process.exit(1);
      },
    );
  });
}
