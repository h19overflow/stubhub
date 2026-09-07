import { randomBytes } from "node:crypto";
import nats, { type Stan } from "node-nats-streaming";
import {
  OrderCompletedListener,
  OrderExpiredListener,
} from "./listeners/index.js";
import { applyOrderEventOnce } from "../tickets/ticket-repo.js";

export interface OrderEventsConsumerOptions {
  url?: string;
  clusterId?: string;
  clientId?: string;
  stan?: Stan;
}

/**
 * Starts the durable NATS Streaming event ingestion & convergence listeners.
 *
 * Encapsulates client connection, durable listener subscription, queue grouping,
 * and graceful cleanup behind a single call.
 *
 * @returns An async stop function for clean service shutdown.
 */
export async function startOrderEventsConsumer(
  options: OrderEventsConsumerOptions = {},
): Promise<() => Promise<void>> {
  const clusterId =
    options.clusterId ?? process.env.NATS_CLUSTER_ID ?? "ticketing";
  const clientId =
    options.clientId ??
    process.env.NATS_CLIENT_ID ??
    `tickets-consumer-${randomBytes(4).toString("hex")}`;
  const url = options.url ?? process.env.NATS_URL ?? "http://localhost:4222";

  const client: Stan =
    options.stan ??
    (await new Promise<Stan>((resolve, reject) => {
      const stan = nats.connect(clusterId, clientId, { url });
      stan.on("connect", () => {
        resolve(stan);
      });
      stan.on("error", (err) => {
        console.error("Tickets NATS connection error:", err);
        reject(err);
      });
    }));

  const completedListener = new OrderCompletedListener(client);
  const expiredListener = new OrderExpiredListener(client);

  completedListener.listen();
  expiredListener.listen();

  return async () => {
    // Close subscriptions and await in-flight message handlers up to 10s
    await Promise.allSettled([
      completedListener.close(10_000),
      expiredListener.close(10_000),
    ]);
    client.close();
  };
}

export {
  applyOrderEventOnce as processOrderEvent,
  OrderCompletedListener,
  OrderExpiredListener,
};
