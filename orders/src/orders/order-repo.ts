import { randomUUID } from "node:crypto";
import { database, withTransaction } from "../database.js";
import { enqueueOrderFact } from "../messaging/index.js";
import { toOrder } from "./order.js";
import { retryDelayMs } from "../retry-delay.js";
import type { Order, OrderRow } from "./order.js";

const columns = `id,user_id,ticket_id,amount_cents,currency,status,expires_at,version,
 seller_user_id,ticket_event_name,ticket_description,ticket_event_starts_at,ticket_event_ends_at,ticket_place,ticket_info,created_at,updated_at`;

type Snapshot = {
  eventName: string;
  description: string;
  eventStartsAt: string;
  eventEndsAt: string | null;
  place: string;
  ticketInfo: string;
};

type ReportContext = {
  orderId: string;
  orderStatus: "complete";
  reportedUserId: string;
  ticket: {
    ticketId: string;
    eventName: string;
    description: string;
    eventStartsAt: string;
    eventEndsAt: string | null;
    place: string;
    ticketInfo: string;
  };
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

/**
 * Reads the bounded evidence needed to decide whether a buyer may report a
 * seller from a completed Order. The buyer, status, seller, and non-null
 * snapshot predicates are applied together so no invalid case is disclosed.
 */
function findReportContext(
  orderId: string,
  reporterUserId: string,
  reportedUserId: string,
): ReportContext | null {
  const row = database
    .prepare(
      `SELECT ${columns}
       FROM orders
       WHERE id=?
         AND user_id=?
         AND status='complete'
         AND seller_user_id=?
         AND seller_user_id IS NOT NULL
         AND ticket_description IS NOT NULL`,
    )
    .get(orderId, reporterUserId, reportedUserId) as OrderRow | undefined;
  if (!row || row.seller_user_id === null || row.ticket_description === null) {
    return null;
  }
  return {
    orderId: row.id,
    orderStatus: "complete",
    reportedUserId: row.seller_user_id,
    ticket: {
      ticketId: row.ticket_id,
      eventName: row.ticket_event_name,
      description: row.ticket_description,
      eventStartsAt: new Date(row.ticket_event_starts_at).toISOString(),
      eventEndsAt:
        row.ticket_event_ends_at === null
          ? null
          : new Date(row.ticket_event_ends_at).toISOString(),
      place: row.ticket_place,
      ticketInfo: row.ticket_info,
    },
  };
}

/**
 * Fetches a raw OrderRow by id (used by the Orders worker and purchase workflow).
 */
function findOrderRow(id: string): OrderRow | null {
  return (
    (database.prepare(`SELECT ${columns} FROM orders WHERE id=?`).get(id) as
      | OrderRow
      | undefined) ?? null
  );
}

/**
 * Fetches an Order owned by a user (authorization check); returns public Order or null.
 *
 * Flow: payment submit and GET /orders/:id use this to ensure caller owns the order.
 */
function findOrderByIdForUser(userId: string, id: string): Order | null {
  const row = database
    .prepare(`SELECT ${columns} FROM orders WHERE id=? AND user_id=?`)
    .get(id, userId) as OrderRow | undefined;
  return row ? toOrder(row) : null;
}

/**
 * Lists a user's pending, payment_processing, and complete Orders for order
 * history, excluding expired Orders (GET /orders).
 */
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

/**
 * Finds a purchase operation by user+idempotencyKey for replay detection.
 */
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

/**
 * Atomically creates or replays only the durable reserving purchase operation
 * and allocates its future Order ID with the idempotency guard.
 *
 * `completePurchase` inserts the Order after the reservation succeeds.
 */
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
    sellerUserId: string;
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
           seller_user_id,ticket_event_name,ticket_description,ticket_event_starts_at,
           ticket_event_ends_at,ticket_place,ticket_info,created_at,updated_at
         )
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        operation.order_id,
        operation.user_id,
        operation.ticket_id,
        reservation.priceCents,
        reservation.currency,
        operation.expires_at,
        reservation.sellerUserId,
        reservation.ticket.eventName,
        reservation.ticket.description,
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

/**
 * Advances a reserving or releasing purchase operation after a retryable error.
 * The state and retry-count predicates form a compare-and-set, so a stale worker
 * cannot overwrite newer durable bookkeeping. Returns false when that snapshot no
 * longer matches, and true only when the next retry and error are persisted.
 */
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

/**
 * Selects at most 100 reserving or releasing operations whose persisted retry
 * deadline is due, in deadline/order order, for bounded worker processing.
 */
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

/**
 * Selects at most 100 pending orders eligible for expiration because their
 * expiration time is due, ordered by expiration time and ID.
 */
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

/**
 * [STAGE 1: STAGE]
 * Atomically applies a guarded terminal order transition and inserts its matching
 * event publication into the outbox ledger (`order_event_publications`). Completed
 * events require payment_processing; expired events require a still-pending, already-expired order.
 * Returns null when the guarded state no longer matches, otherwise the transitioned durable order.
 */
function enqueueTerminal(
  orderId: string,
  eventType: "order.completed" | "order.expired",
  now: number,
): Order | null {
  return withTransaction(() => {
    let row: OrderRow | undefined;
    if (eventType === "order.completed") {
      row = database
        .prepare(
          `UPDATE orders
           SET status='complete',version=version+1,updated_at=?
           WHERE id=? AND status='payment_processing'
           RETURNING ${columns}`,
        )
        .get(now, orderId) as OrderRow | undefined;
    } else {
      row = database
        .prepare(
          `UPDATE orders
           SET status='expired',version=version+1,updated_at=?
           WHERE id=? AND status='pending' AND expires_at<=?
           RETURNING ${columns}`,
        )
        .get(now, orderId, now) as OrderRow | undefined;
    }
    if (!row) return null;

    enqueueOrderFact({
      orderId,
      orderVersion: row.version,
      eventType,
      payload: { ticketId: row.ticket_id },
    });
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
  findReportContext,
  listOrdersForUser,
  rejectPurchase,
  schedulePurchase,
};
export type {
  CreatePurchaseResult,
  PurchaseRow,
  PurchaseState,
  ReportContext,
  Snapshot,
};
