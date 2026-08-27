import { database } from "../database.js";
import { toOrder } from "./order.js";
import type { CreateOrderInput, CreateOrderResult, Order, OrderRow } from "./order.js";

const orderColumns = `
  id,
  user_id,
  ticket_id,
  amount_cents,
  currency,
  status,
  expires_at,
  version,
  idempotency_key,
  request_fingerprint,
  created_at,
  updated_at
`;

function readOrderById(id: string): OrderRow | null {
  const row = database
    .prepare(`SELECT ${orderColumns} FROM orders WHERE id = ?`)
    .get(id) as OrderRow | undefined;
  return row ?? null;
}

function readOrderByUserKey(userId: string, idempotencyKey: string): OrderRow | null {
  const row = database
    .prepare(`SELECT ${orderColumns} FROM orders WHERE user_id = ? AND idempotency_key = ?`)
    .get(userId, idempotencyKey) as OrderRow | undefined;
  return row ?? null;
}

/**
 * Creates one pending Order or resolves an idempotent retry.
 *
 * Uniqueness is scoped to `(userId, idempotencyKey)`; the fingerprint prevents
 * one key from silently representing two different purchase requests.
 */
function createOrder(input: CreateOrderInput, now: number): CreateOrderResult {
  const inserted = database
    .prepare(
      `INSERT INTO orders (
        id,
        user_id,
        ticket_id,
        amount_cents,
        expires_at,
        idempotency_key,
        request_fingerprint,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, idempotency_key) DO NOTHING`,
    )
    .run(
      input.id,
      input.userId,
      input.ticketId,
      input.amountCents,
      Date.parse(input.expiresAt),
      input.idempotencyKey,
      input.requestFingerprint,
      now,
      now,
    );

  if (Number(inserted.changes) === 1) {
    const row = readOrderById(input.id);
    if (!row) throw new Error("Created order could not be read");
    return { outcome: "created", order: toOrder(row) };
  }

  const row = readOrderByUserKey(input.userId, input.idempotencyKey);
  if (!row) throw new Error("Idempotent order could not be read");
  if (row.request_fingerprint === input.requestFingerprint) {
    return { outcome: "replayed", order: toOrder(row) };
  }
  return { outcome: "conflict" };
}

/** Finds an Order only when it belongs to the requesting user. */
function findOrderByIdForUser(userId: string, orderId: string): Order | null {
  const row = database
    .prepare(`SELECT ${orderColumns} FROM orders WHERE id = ? AND user_id = ?`)
    .get(orderId, userId) as OrderRow | undefined;
  return row ? toOrder(row) : null;
}

/** Lists active Orders and completed purchases; expired Orders are intentionally omitted. */
function listOrdersForUser(userId: string): Order[] {
  const rows = database
    .prepare(
      `SELECT ${orderColumns}
       FROM orders
       WHERE user_id = ? AND status IN ('pending', 'payment_processing', 'complete')
       ORDER BY created_at DESC, id ASC`,
    )
    .all(userId) as OrderRow[];
  return rows.map(toOrder);
}

/**
 * Claims an unexpired pending Order for payment and increments its version.
 * Returns null when the Order is missing, belongs to another user, is not pending, or expired.
 */
function beginOrderPayment(userId: string, orderId: string, now: number): Order | null {
  const row = database
    .prepare(
      `UPDATE orders
       SET status = 'payment_processing', version = version + 1, updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'pending' AND expires_at > ?
       RETURNING ${orderColumns}`,
    )
    .get(now, orderId, userId, now) as OrderRow | undefined;
  return row ? toOrder(row) : null;
}

/**
 * Completes only an Order currently in `payment_processing` and increments its version.
 * Returns null when another transition already won or the Order does not exist.
 */
function completeOrderPayment(orderId: string, now: number): Order | null {
  const row = database
    .prepare(
      `UPDATE orders
       SET status = 'complete', version = version + 1, updated_at = ?
       WHERE id = ? AND status = 'payment_processing'
       RETURNING ${orderColumns}`,
    )
    .get(now, orderId) as OrderRow | undefined;
  return row ? toOrder(row) : null;
}

/**
 * After provider failure, restores the Order to `pending` only while reservation
 * time remains. The caller is responsible for establishing that payment failed.
 */
function returnOrderToPending(orderId: string, now: number): Order | null {
  const row = database
    .prepare(
      `UPDATE orders
       SET status = 'pending', version = version + 1, updated_at = ?
       WHERE id = ? AND status = 'payment_processing' AND expires_at > ?
       RETURNING ${orderColumns}`,
    )
    .get(now, orderId, now) as OrderRow | undefined;
  return row ? toOrder(row) : null;
}

/**
 * After provider failure, expires a processing Order whose deadline has passed.
 * The caller is responsible for establishing that payment is no longer in flight.
 */
function expireOrderAfterFailedPayment(orderId: string, now: number): Order | null {
  const row = database
    .prepare(
      `UPDATE orders
       SET status = 'expired', version = version + 1, updated_at = ?
       WHERE id = ? AND status = 'payment_processing' AND expires_at <= ?
       RETURNING ${orderColumns}`,
    )
    .get(now, orderId, now) as OrderRow | undefined;
  return row ? toOrder(row) : null;
}

/** Expires an unpaid pending Order only after its deadline and increments its version. */
function expirePendingOrder(orderId: string, now: number): Order | null {
  const row = database
    .prepare(
      `UPDATE orders
       SET status = 'expired', version = version + 1, updated_at = ?
       WHERE id = ? AND status = 'pending' AND expires_at <= ?
       RETURNING ${orderColumns}`,
    )
    .get(now, orderId, now) as OrderRow | undefined;
  return row ? toOrder(row) : null;
}

export {
  beginOrderPayment,
  completeOrderPayment,
  createOrder,
  expirePendingOrder,
  expireOrderAfterFailedPayment,
  findOrderByIdForUser,
  listOrdersForUser,
  returnOrderToPending,
};
