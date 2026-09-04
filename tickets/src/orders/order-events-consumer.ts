import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { orderEventSchema } from "../tickets/schemas.js";
import { ticketsOrderConvergenceConsumer } from "../tickets/ticket.js";
import { applyOrderEventOnce } from "../tickets/ticket-repo.js";

const stream = "orders.events";
const deadLetterStream = "orders.events.dead-letter";
const group = ticketsOrderConvergenceConsumer;
const consumer = `${hostname()}-${process.pid}-${randomUUID()}`;

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const claimIdleMs = positiveInteger("TICKETS_EVENTS_CLAIM_IDLE_MS", 30_000);
const claimIntervalMs = positiveInteger("TICKETS_EVENTS_CLAIM_INTERVAL_MS", 10_000);
const batchSize = positiveInteger("TICKETS_EVENTS_BATCH_SIZE", 50);

type StreamEntry = { id: string; message: Record<string, string> };

type ConsumerClient = {
  xAdd(key: string, id: string, message: Record<string, string>): Promise<string>;
  xAck(key: string, group: string, id: string): Promise<number>;
};

/**
 * Parses and schema-validates a stream entry. Returns null if malformed.
 */
function parseEvent(entry: StreamEntry) {
  try {
    const parsed = orderEventSchema.safeParse(JSON.parse(entry.message.event ?? ""));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * [STAGE 3: INGEST & STAGE 4: CONVERGE & ACK]
 *
 * Processes a single stream entry:
 * - Poison detection: malformed entries are routed to DLQ before ACK.
 * - Idempotent convergence: delegates to applyOrderEventOnce in SQLite.
 * - Durable ordering: sends Redis XACK only after DB transaction commits.
 */
async function processStreamEntry(
  client: ConsumerClient,
  entry: StreamEntry,
): Promise<void> {
  const event = parseEvent(entry);
  if (!event) {
    console.error(`Tickets dead-lettering poison order event ${entry.id}`);
    await client.xAdd(deadLetterStream, "*", entry.message);
    await client.xAck(stream, group, entry.id);
    return;
  }

  applyOrderEventOnce(event);
  await client.xAck(stream, group, entry.id);
}

/**
 * Starts the durable background event ingestion & convergence worker.
 *
 * All transport setup, consumer groups, PEL autoclaim, stream reading,
 * and graceful draining are hidden behind this single call.
 * Returns an async stop function for clean service shutdown.
 */
async function startOrderEventsConsumer(
  options: { redisUrl?: string } = {},
): Promise<() => Promise<void>> {
  const url = options.redisUrl ?? process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is required");
  }

  const client = createClient({ url });
  client.on("error", (err) => console.error("Tickets Redis error", err));
  await client.connect();

  try {
    await client.xGroupCreate(stream, group, "0", { MKSTREAM: true });
  } catch (err) {
    const isBusy = err instanceof Error && err.message.includes("BUSYGROUP");
    if (!isBusy) throw err;
  }

  let stopping = false;
  let nextClaimAt = 0;

  async function processBatch(entries: Array<StreamEntry | null>): Promise<void> {
    for (const entry of entries) {
      if (entry) await processStreamEntry(client, entry);
    }
  }

  async function recoverPending(): Promise<void> {
    let cursor = "0-0";
    do {
      const claimed = await client.xAutoClaim(stream, group, consumer, claimIdleMs, cursor, {
        COUNT: batchSize,
      });
      await processBatch(claimed.messages);
      cursor = claimed.nextId;
    } while (!stopping && cursor !== "0-0");
  }

  async function readNewEntries(): Promise<void> {
    const batches = await client.xReadGroup(group, consumer, [{ key: stream, id: ">" }], {
      COUNT: batchSize,
      BLOCK: 1_000,
    });
    for (const batch of batches ?? []) {
      await processBatch(batch.messages);
    }
  }

  async function poll(): Promise<void> {
    if (Date.now() >= nextClaimAt) {
      await recoverPending();
      nextClaimAt = Date.now() + claimIntervalMs;
    }
    await readNewEntries();
  }

  const loop = (async () => {
    while (!stopping) {
      try {
        await poll();
      } catch (err) {
        if (stopping) return;
        console.error("Tickets order event consumption failed", err);
        await new Promise((r) => setTimeout(r, 1_000));
      }
    }
  })();

  return async () => {
    stopping = true;
    await loop;
    await client.quit();
  };
}

export { startOrderEventsConsumer, processStreamEntry };
export type { StreamEntry, ConsumerClient };
