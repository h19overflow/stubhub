import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { orderEventSchema } from "../tickets/schemas.js";
import { applyOrderEventOnce } from "../tickets/ticket-repo.js";

const stream = "orders.events";
const deadLetterStream = "orders.events.dead-letter";
const group = "tickets-order-convergence";
const consumer = `${hostname()}-${process.pid}-${randomUUID()}`;

/**
 * Reads a positive integer setting, using the fallback only when the
 * environment variable is absent. Invalid values fail startup so timing and
 * batch controls cannot silently use unsafe configuration.
 */
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

/**
 * Delays a failed-consumption retry so transient Redis or processing errors do
 * not spin the worker in a tight loop.
 */
function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Parses and schema-validates the event field. Malformed or invalid entries
 * return null so the caller can dead-letter them before acknowledging them.
 */
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

/**
 * Connects the consumer to Redis, creates the order-event consumer group (or
 * reuses it when Redis reports BUSYGROUP), and starts pending recovery plus
 * the new-entry loop. The returned shutdown function marks the loop stopping,
 * waits for current work, and closes Redis; entries are acknowledged only
 * after durable processing.
 */
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

  /**
   * Handles one Redis entry. Poison entries are written to the dead-letter
   * stream before ACK; valid entries finish their processed-event/Ticket
   * transaction before ACK. A failure before ACK leaves the entry pending.
   */
  async function processEntry(entry: StreamEntry): Promise<void> {
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
   * Processes a batch sequentially, awaiting each entry's durable outcome
   * before starting the next. A failure stops the batch, leaving later or
   * unacknowledged entries for a subsequent recovery scan.
   */
  async function processEntries(
    entries: Array<StreamEntry | null>,
  ): Promise<void> {
    for (const entry of entries) {
      if (entry) {
        await processEntry(entry);
      }
    }
  }

  /**
   * Reclaims stale entries from the consumer group's Pending Entries List with
   * XAUTOCLAIM, processing them in COUNT-sized batches. Processed-event
   * deduplication (inbox pattern) makes this safe after a crash between the
   * database commit and Redis ACK.
   */
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

  /**
   * Reads entries never delivered to this consumer group by using the `>`
   * cursor. Pending entries are handled separately by recoverPending, and the
   * bounded block keeps shutdown responsive.
   */
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

  /**
   * Runs one consumption iteration, recovering stale pending work when due
   * before blocking for new entries. The claim schedule advances only after a
   * successful recovery scan; retry backoff is handled by the outer loop.
   */
  async function consumeAvailableEntries(): Promise<void> {
    if (Date.now() >= nextClaimAt) {
      await recoverPending();
      nextClaimAt = Date.now() + claimIntervalMs;
    }
    await readNewEntries();
  }

  /**
   * Handles a failed consumption iteration by logging it and backing off before
   * retrying. During shutdown it skips the delay so the returned shutdown
   * function can finish promptly.
   */
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
