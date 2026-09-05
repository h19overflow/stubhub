import { randomBytes } from "node:crypto";
import nats, { type Stan } from "node-nats-streaming";

let defaultStan: Stan | null = null;
let connectingPromise: Promise<Stan> | null = null;

/**
 * Returns an active NATS Streaming client connection, connecting lazily on first access.
 */
export function getNatsClient(): Promise<Stan> {
  if (defaultStan) return Promise.resolve(defaultStan);
  if (connectingPromise) return connectingPromise;

  connectingPromise = new Promise((resolve, reject) => {
    const clusterId = process.env.NATS_CLUSTER_ID ?? "ticketing";
    const clientId =
      process.env.NATS_CLIENT_ID ??
      `orders-publisher-${randomBytes(4).toString("hex")}`;
    const url = process.env.NATS_URL ?? "http://localhost:4222";

    const stan = nats.connect(clusterId, clientId, { url });

    stan.on("connect", () => {
      defaultStan = stan;
      connectingPromise = null;
      resolve(stan);
    });

    stan.on("error", (error) => {
      console.error("Orders messaging NATS error", error);
      if (!defaultStan) {
        connectingPromise = null;
        reject(error);
      }
    });

    stan.on("close", () => {
      defaultStan = null;
      connectingPromise = null;
    });
  });

  return connectingPromise;
}

/**
 * Closes the NATS Streaming connection on shutdown.
 */
export async function closeNatsClient(): Promise<void> {
  if (defaultStan) {
    defaultStan.close();
    defaultStan = null;
  }
  connectingPromise = null;
}
