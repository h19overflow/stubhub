import { createClient, type RedisClientType } from "redis";

export type EventBusClient = RedisClientType;

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

export async function publishEvent(
  client: EventBusClient,
  stream: string,
  event: unknown,
): Promise<string> {
  return client.xAdd(stream, "*", { event: JSON.stringify(event) });
}
