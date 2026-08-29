import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { orderEventSchema } from "../tickets/schemas.js";
import { consumeOrderEvent } from "../tickets/ticket-repo.js";

const stream = "orders.events";
const deadLetterStream = "orders.events.dead-letter";
const group = "tickets-order-convergence";
const consumer = `${hostname()}-${process.pid}-${randomUUID()}`;

function positiveIntegerSetting(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

const claimIdleMs = positiveIntegerSetting("TICKETS_EVENTS_CLAIM_IDLE_MS", 30_000);
const claimIntervalMs = positiveIntegerSetting("TICKETS_EVENTS_CLAIM_INTERVAL_MS", 10_000);
const batchSize = positiveIntegerSetting("TICKETS_EVENTS_BATCH_SIZE", 50);

type StreamEntry = { id: string; message: Record<string, string> };

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseEvent(entry: StreamEntry) {
  try {
    const parsed = orderEventSchema.safeParse(
      JSON.parse(entry.message.event ?? ""),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function startOrderEventsConsumer(): Promise<() => Promise<void>> {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is required");
  }

  const client = createClient({ url });
  client.on("error", (error) => {
    console.error("Tickets Redis error", error);
  });
  await client.connect();

  try {
    await client.xGroupCreate(stream, group, "0", { MKSTREAM: true });
  } catch (error) {
    const groupExists =
      error instanceof Error && error.message.includes("BUSYGROUP");
    if (!groupExists) {
      throw error;
    }
  }

  let stopping = false;

  async function processEntry(entry: StreamEntry): Promise<void> {
    const event = parseEvent(entry);
    if (!event) {
      console.error(`Tickets dead-lettering poison order event ${entry.id}`);
      await client.xAdd(deadLetterStream, "*", entry.message);
      await client.xAck(stream, group, entry.id);
      return;
    }

    consumeOrderEvent(event);
    await client.xAck(stream, group, entry.id);
  }

  async function processEntries(
    entries: Array<StreamEntry | null>,
  ): Promise<void> {
    for (const entry of entries) {
      if (entry) {
        await processEntry(entry);
      }
    }
  }

  async function recoverPending(): Promise<void> {
    let cursor = "0-0";
    do {
      const claimed = await client.xAutoClaim(
        stream,
        group,
        consumer,
        claimIdleMs,
        cursor,
        { COUNT: batchSize },
      );
      await processEntries(claimed.messages);
      cursor = claimed.nextId;
    } while (!stopping && cursor !== "0-0");
  }

  async function readNewEntries(): Promise<void> {
    const batches = await client.xReadGroup(
      group,
      consumer,
      [{ key: stream, id: ">" }],
      { COUNT: batchSize, BLOCK: 1_000 },
    );
    for (const batch of batches ?? []) {
      await processEntries(batch.messages);
    }
  }

  let nextClaimAt = 0;

  async function consumeAvailableEntries(): Promise<void> {
    if (Date.now() >= nextClaimAt) {
      await recoverPending();
      nextClaimAt = Date.now() + claimIntervalMs;
    }
    await readNewEntries();
  }

  async function handleConsumptionFailure(error: unknown): Promise<void> {
    if (stopping) {
      return;
    }
    console.error("Tickets order event consumption failed", error);
    await sleep(1_000);
  }

  await recoverPending();
  nextClaimAt = Date.now() + claimIntervalMs;

  const loop = (async () => {
    while (!stopping) {
      try {
        await consumeAvailableEntries();
      } catch (error) {
        await handleConsumptionFailure(error);
      }
    }
  })();

  return async () => {
    stopping = true;
    await loop;
    await client.quit();
  };
}

export { startOrderEventsConsumer };
