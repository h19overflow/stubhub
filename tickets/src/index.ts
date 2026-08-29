import { app } from "./app.js";
import { startOrderEventsConsumer } from "./orders/order-events-consumer.js";

const rawPort = process.env.PORT;
const port = rawPort === undefined ? 3002 : Number(rawPort);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
  throw new Error("PORT must be a positive integer no greater than 65535");
}
const stopConsumer = await startOrderEventsConsumer();
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Tickets service listening on port ${port}`);
});
let stopping = false;

async function shutdown(): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  await stopConsumer();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown().then(
      () => process.exit(0),
      (error) => {
        console.error("Tickets shutdown failed", error);
        process.exit(1);
      },
    );
  });
}
