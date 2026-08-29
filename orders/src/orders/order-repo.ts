import { randomUUID } from "node:crypto";
import { database, withTransaction } from "../database.js";
import { toOrder } from "./order.js";
import { retryDelayMs } from "../retry-delay.js";
import type { Order, OrderRow } from "./order.js";

const columns = `id,user_id,ticket_id,amount_cents,currency,status,expires_at,version,
 ticket_event_name,ticket_event_starts_at,ticket_event_ends_at,ticket_place,ticket_info,created_at,updated_at`;

type Snapshot = {
  eventName: string;
  eventStartsAt: string;
  eventEndsAt: string | null;
  place: string;
  ticketInfo: string;
};

type PurchaseState = "reserving" | "completed" | "releasing" | "rejected";

type PurchaseRow = {
  order_id: string;
  user_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  ticket_id: string;
  expires_at: number;
  state: PurchaseState;
  rejection_code: string | null;
  retry_count: number;
  next_retry_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

type CreatePurchaseResult =
  | { kind: "created" | "replayed"; operation: PurchaseRow }
  | { kind: "conflict" };

function positiveIntegerSetting(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const purchaseTtlMs = positiveIntegerSetting("ORDER_EXPIRATION_MS", 15 * 60_000);

function findOrderRow(id: string): OrderRow | null {
  return (
    (database.prepare(`SELECT ${columns} FROM orders WHERE id=?`).get(id) as
      | OrderRow
      | undefined) ?? null
  );
}

function findOrderByIdForUser(userId: string, id: string): Order | null {
  const row = database
    .prepare(`SELECT ${columns} FROM orders WHERE id=? AND user_id=?`)
    .get(id, userId) as OrderRow | undefined;
  return row ? toOrder(row) : null;
}

function listOrdersForUser(userId: string): Order[] {
  const rows = database
    .prepare(
      `SELECT ${columns}
       FROM orders
       WHERE user_id=? AND status IN ('pending','payment_processing','complete')
       ORDER BY created_at DESC,id ASC`,
    )
    .all(userId) as OrderRow[];
  return rows.map(toOrder);
}

function findPurchase(userId: string, key: string): PurchaseRow | null {
  return (
    (database
      .prepare(
        "SELECT * FROM purchase_operations WHERE user_id=? AND idempotency_key=?",
      )
      .get(userId, key) as PurchaseRow | undefined) ?? null
  );
}

function findPurchaseByOrderId(orderId: string): PurchaseRow | null {
  return (
    (database
      .prepare("SELECT * FROM purchase_operations WHERE order_id=?")
      .get(orderId) as PurchaseRow | undefined) ?? null
  );
}

function createPurchase(
  userId: string,
  key: string,
  ticketId: string,
  now: number,
): CreatePurchaseResult {
  return withTransaction(() => {
    const id = randomUUID();
    const expiresAt = now + purchaseTtlMs;
    const inserted = database
      .prepare(
        `INSERT INTO purchase_operations(
           order_id,user_id,idempotency_key,request_fingerprint,ticket_id,expires_at,
           state,next_retry_at,created_at,updated_at
         )
         VALUES(?,?,?,?,?,?,'reserving',?,?,?)
         ON CONFLICT(user_id,idempotency_key) DO NOTHING`,
      )
      .run(id, userId, key, ticketId, ticketId, expiresAt, now, now, now);

    const operation = findPurchase(userId, key);
    if (!operation) throw new Error("purchase operation missing");
    if (operation.request_fingerprint !== ticketId) return { kind: "conflict" };

    return {
      kind: Number(inserted.changes) === 1 ? "created" : "replayed",
      operation,
    };
  });
}

function completePurchase(
  expected: PurchaseRow,
  reservation: {
    expiresAt: string;
    priceCents: number;
    currency: "USD";
    ticket: Snapshot;
  },
  now: number,
): Order | null {
  return withTransaction(() => {
    const operation = findPurchaseByOrderId(expected.order_id);
    if (
      !operation ||
      operation.state !== "reserving" ||
      operation.expires_at !== expected.expires_at ||
      operation.expires_at <= now
    ) {
      return null;
    }
    if (Date.parse(reservation.expiresAt) !== operation.expires_at) {
      throw new Error("reservation deadline changed");
    }

    database
      .prepare(
        `INSERT INTO orders(
           id,user_id,ticket_id,amount_cents,currency,expires_at,
           ticket_event_name,ticket_event_starts_at,ticket_event_ends_at,
           ticket_place,ticket_info,created_at,updated_at
         )
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        operation.order_id,
        operation.user_id,
        operation.ticket_id,
        reservation.priceCents,
        reservation.currency,
        operation.expires_at,
        reservation.ticket.eventName,
        Date.parse(reservation.ticket.eventStartsAt),
        reservation.ticket.eventEndsAt
          ? Date.parse(reservation.ticket.eventEndsAt)
          : null,
        reservation.ticket.place,
        reservation.ticket.ticketInfo,
        operation.created_at,
        now,
      );

    const changed = database
      .prepare(
        `UPDATE purchase_operations
         SET state='completed',rejection_code=NULL,next_retry_at=NULL,
             last_error=NULL,updated_at=?
         WHERE order_id=? AND state='reserving' AND expires_at=?`,
      )
      .run(now, operation.order_id, operation.expires_at);
    if (Number(changed.changes) !== 1) {
      throw new Error("purchase completion transition lost");
    }

    const row = findOrderRow(operation.order_id);
    if (!row) throw new Error("completed order missing");
    return toOrder(row);
  });
}

function rejectPurchase(
  id: string,
  expectedState: "reserving" | "releasing",
  code: string,
  now: number,
): boolean {
  const result = database
    .prepare(
      `UPDATE purchase_operations
       SET state='rejected',rejection_code=?,next_retry_at=NULL,
           last_error=NULL,updated_at=?
       WHERE order_id=? AND state=?`,
    )
    .run(code, now, id, expectedState);
  return Number(result.changes) === 1;
}

function schedulePurchase(
  expected: PurchaseRow,
  state: "reserving" | "releasing",
  error: string,
  now: number,
): boolean {
  const result = database
    .prepare(
      `UPDATE purchase_operations
       SET state=?,retry_count=retry_count+1,next_retry_at=?,
           last_error=?,updated_at=?
       WHERE order_id=? AND state=? AND retry_count=?`,
    )
    .run(
      state,
      now + retryDelayMs(expected.retry_count),
      error.slice(0, 500),
      now,
      expected.order_id,
      expected.state,
      expected.retry_count,
    );
  return Number(result.changes) === 1;
}

function duePurchases(now: number): PurchaseRow[] {
  return database
    .prepare(
      `SELECT *
       FROM purchase_operations
       WHERE state IN ('reserving','releasing') AND next_retry_at<=?
       ORDER BY next_retry_at,order_id
       LIMIT 100`,
    )
    .all(now) as PurchaseRow[];
}

function duePending(now: number): string[] {
  const rows = database
    .prepare(
      `SELECT id
       FROM orders
       WHERE status='pending' AND expires_at<=?
       ORDER BY expires_at,id
       LIMIT 100`,
    )
    .all(now) as { id: string }[];
  return rows.map(({ id }) => id);
}

function enqueueTerminal(
  orderId: string,
  eventType: "order.completed" | "order.expired",
  now: number,
): Order | null {
  return withTransaction(() => {
    const from = eventType === "order.completed" ? "payment_processing" : "pending";
    const status = eventType === "order.completed" ? "complete" : "expired";
    const parameters =
      status === "expired"
        ? [status, now, orderId, from, now]
        : [status, now, orderId, from];
    const row = database
      .prepare(
        `UPDATE orders
         SET status=?,version=version+1,updated_at=?
         WHERE id=? AND status=? ${status === "expired" ? "AND expires_at<=?" : ""}
         RETURNING ${columns}`,
      )
      .get(...parameters) as OrderRow | undefined;
    if (!row) return null;

    database
      .prepare(
        `INSERT INTO outbox_messages(
           id,aggregate_type,aggregate_id,aggregate_version,event_type,
           event_version,payload,created_at,updated_at,next_attempt_at
         )
         VALUES(?,'order',?,?,?,1,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        orderId,
        row.version,
        eventType,
        JSON.stringify({ ticketId: row.ticket_id }),
        now,
        now,
        now,
      );
    return toOrder(row);
  });
}

export {
  completePurchase,
  createPurchase,
  duePending,
  duePurchases,
  enqueueTerminal,
  findOrderByIdForUser,
  findOrderRow,
  findPurchase,
  findPurchaseByOrderId,
  listOrdersForUser,
  rejectPurchase,
  schedulePurchase,
};
export type { CreatePurchaseResult, PurchaseRow, PurchaseState, Snapshot };
