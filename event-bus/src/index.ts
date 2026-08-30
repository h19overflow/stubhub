import { createClient, type RedisClientType } from "redis";

export type EventBusClient = RedisClientType;

/**
 * Creates and connects a Redis event-bus client. The returned client is ready
 * for stream operations; connection errors are surfaced by the rejected
 * promise and ongoing Redis errors are logged by the client listener.
 */
export async function connectEventBus(
  url = process.env.REDIS_URL ?? "redis://redis:6379",
): Promise<EventBusClient> {
  const client = createClient({ url });

  client.on("error", (error) => {
    console.error("Redis event bus error", error);
  });

  await client.connect();
  return client;
}

/**
 * Serializes one application event into a Redis stream entry. Redis generates
 * the entry ID (the `*` ID), which this function returns; publishing is not a
 * cross-system transaction or an exactly-once delivery guarantee.
 */
export async function publishEvent(
  client: EventBusClient,
  stream: string,
  event: unknown,
): Promise<string> {
  return client.xAdd(stream, "*", { event: JSON.stringify(event) });
}
