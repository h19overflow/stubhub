import { randomUUID } from "node:crypto";
import { database, withTransaction } from "../database.js";
import { enqueueOrderEventPublication } from "../messaging/order-event-publication-repo.js";
import { toOrder } from "../orders/order.js";
import type { Order, OrderRow } from "../orders/order.js";
import { retryDelayMs } from "../retry-delay.js";
import { toPaymentAttempt } from "./payment-attempt.js";
import type {
  PaymentAttempt,
  PaymentAttemptRow,
  ProviderScenario,
} from "./payment-attempt.js";

const attemptColumns =
  "id,order_id,status,provider_scenario,provider_reference,failure_code,idempotency_key,request_fingerprint,reconcile_attempt_count,next_reconcile_at,last_reconcile_error,created_at,updated_at";
const orderColumns =
  "id,user_id,ticket_id,amount_cents,currency,status,expires_at,version,seller_user_id,ticket_event_name,ticket_description,ticket_event_starts_at,ticket_event_ends_at,ticket_place,ticket_info,created_at,updated_at";

type PaymentWorkResult = {
  attemptRow: PaymentAttemptRow;
  attempt: PaymentAttempt;
  order: Order;
};

type BeginPaymentResult =
  | ({ kind: "created" } & PaymentWorkResult)
  | ({ kind: "replayed" } & PaymentWorkResult)
  | ({ kind: "processing" } & PaymentWorkResult)
  | { kind: "conflict" }
  | { kind: "not_payable" };

function rowByKey(orderId: string, key: string): PaymentAttemptRow | null {
  return (
    (database
      .prepare(
        `SELECT ${attemptColumns}
         FROM payment_attempts
         WHERE order_id=? AND idempotency_key=?`,
      )
      .get(orderId, key) as PaymentAttemptRow | undefined) ?? null
  );
}

function processing(orderId: string): PaymentAttemptRow | null {
  return (
    (database
      .prepare(
        `SELECT ${attemptColumns}
         FROM payment_attempts
         WHERE order_id=? AND status='processing'`,
      )
      .get(orderId) as PaymentAttemptRow | undefined) ?? null
  );
}

function beginPayment(
  userId: string,
  orderId: string,
  key: string,
  scenario: ProviderScenario,
  now: number,
): BeginPaymentResult {
  return withTransaction(() => {
    const same = rowByKey(orderId, key);
    const owned = database
      .prepare(`SELECT ${orderColumns} FROM orders WHERE id=? AND user_id=?`)
      .get(orderId, userId) as OrderRow | undefined;
    if (!owned) return { kind: "not_payable" };
    if (same) {
      if (same.request_fingerprint !== scenario) return { kind: "conflict" };
      return {
        kind: "replayed",
        attemptRow: same,
        attempt: toPaymentAttempt(same),
        order: toOrder(owned),
      };
    }

    const active = processing(orderId);
    if (active) {
      return {
        kind: "processing",
        attempt: toPaymentAttempt(active),
        attemptRow: active,
        order: toOrder(owned),
      };
    }

    const changed = database
      .prepare(
        `UPDATE orders
         SET status='payment_processing',version=version+1,updated_at=?
         WHERE id=? AND user_id=? AND status='pending' AND expires_at>?`,
      )
      .run(now, orderId, userId, now);
    if (Number(changed.changes) !== 1) return { kind: "not_payable" };

    const id = randomUUID();
    database
      .prepare(
        `INSERT INTO payment_attempts(
           id,order_id,provider_scenario,idempotency_key,request_fingerprint,
           next_reconcile_at,created_at,updated_at
         )
         VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(id, orderId, scenario, key, scenario, now, now, now);

    const attempt = database
      .prepare(`SELECT ${attemptColumns} FROM payment_attempts WHERE id=?`)
      .get(id) as PaymentAttemptRow;
    const order = database
      .prepare(`SELECT ${orderColumns} FROM orders WHERE id=?`)
      .get(orderId) as OrderRow;
    return {
      kind: "created",
      attemptRow: attempt,
      attempt: toPaymentAttempt(attempt),
      order: toOrder(order),
    };
  });
}

function updateProviderReference(
  expected: PaymentAttemptRow,
  reference: string,
  now: number,
): boolean {
  const result = database
    .prepare(
      `UPDATE payment_attempts
       SET provider_reference=?,reconcile_attempt_count=reconcile_attempt_count+1,
           next_reconcile_at=?,updated_at=?
       WHERE id=? AND status=? AND reconcile_attempt_count=?`,
    )
    .run(
      reference,
      now + retryDelayMs(expected.reconcile_attempt_count),
      now,
      expected.id,
      expected.status,
      expected.reconcile_attempt_count,
    );
  return Number(result.changes) === 1;
}

/**
 * Resolves a processing payment attempt and its guarded order transition in one
 * transaction, inserting an event publication when the order becomes complete or
 * expired. A decline returns the order to pending while unexpired, or expires it
 * otherwise. Returns null when the attempt is absent; an already terminal attempt
 * is returned unchanged, and a lost processing-order transition throws so the
 * transaction rolls back.
 */
function resolveAttempt(
  id: string,
  outcome: "succeeded" | "declined",
  reference: string,
  failure: string | null,
  now: number,
): { order: Order; attempt: PaymentAttempt } | null {
  return withTransaction(() => {
    const attempt = findPaymentAttemptRow(id);
    if (!attempt) return null;

    if (attempt.status !== "processing") {
      const order = findOrderRowById(attempt.order_id);
      if (!order) throw new Error("payment order missing");
      return { order: toOrder(order), attempt: toPaymentAttempt(attempt) };
    }

    updatePaymentAttemptTerminalStatus(id, outcome, reference, failure, now);

    const order = transitionOrderOnPaymentResolution(attempt.order_id, outcome, now);
    if (!order) throw new Error("payment order transition lost");

    enqueueTerminalOrderEvent(order);

    const updated = findPaymentAttemptRow(id);
    if (!updated) throw new Error("updated payment attempt missing");

    return { order: toOrder(order), attempt: toPaymentAttempt(updated) };
  });
}

/**
 * Selects at most 100 processing payment attempts whose reconciliation deadline is
 * due, ordered by deadline and ID for bounded reconciliation work.
 */
function dueAttempts(now: number): PaymentAttemptRow[] {
  return database
    .prepare(
      `SELECT ${attemptColumns}
       FROM payment_attempts
       WHERE status='processing' AND next_reconcile_at<=?
       ORDER BY next_reconcile_at,id
       LIMIT 100`,
    )
    .all(now) as PaymentAttemptRow[];
}

/**
 * Schedules payment reconciliation with a compare-and-set on status and persisted
 * attempt count, incrementing the count and storing the next deadline/error. Returns
 * false when the expected snapshot is stale, and true only when one row is updated.
 */
function scheduleAttempt(
  expected: PaymentAttemptRow,
  error: string,
  now: number,
): boolean {
  const result = database
    .prepare(
      `UPDATE payment_attempts
       SET reconcile_attempt_count=reconcile_attempt_count+1,next_reconcile_at=?,
           last_reconcile_error=?,updated_at=?
       WHERE id=? AND status=? AND reconcile_attempt_count=?`,
    )
    .run(
      now + retryDelayMs(expected.reconcile_attempt_count),
      error.slice(0, 500),
      now,
      expected.id,
      expected.status,
      expected.reconcile_attempt_count,
    );
  return Number(result.changes) === 1;
}

type ProgressPaymentAttemptResult =
  | { outcome: "processing"; attempt: PaymentAttempt; order?: Order }
  | { outcome: "resolved"; attempt: PaymentAttempt; order: Order };

/**
 * Progresses a payment attempt against a provider result: updates the provider
 * reference, and if the provider reached a non-processing outcome (succeeded or
 * declined), resolves the attempt and order transition in a guarded transaction.
 */
function progressPaymentAttempt(
  attempt: PaymentAttemptRow,
  provider: {
    reference: string;
    status: "processing" | "succeeded" | "declined";
    failureCode: string | null;
  },
  now: number,
): ProgressPaymentAttemptResult | null {
  if (!updateProviderReference(attempt, provider.reference, now)) {
    return null;
  }

  if (provider.status === "processing") {
    return {
      outcome: "processing",
      attempt: {
        ...toPaymentAttempt(attempt),
        providerReference: provider.reference,
      },
    };
  }

  const resolved = resolveAttempt(
    attempt.id,
    provider.status === "succeeded" ? "succeeded" : "declined",
    provider.reference,
    provider.failureCode,
    now,
  );
  if (!resolved) {
    throw new Error("payment resolution missing");
  }

  return {
    outcome: "resolved",
    attempt: resolved.attempt,
    order: resolved.order,
  };
}

/**
 * Fetches a raw PaymentAttemptRow by ID, returning null if not found.
 */
function findPaymentAttemptRow(id: string): PaymentAttemptRow | null {
  return (
    (database
      .prepare(`SELECT ${attemptColumns} FROM payment_attempts WHERE id=?`)
      .get(id) as PaymentAttemptRow | undefined) ?? null
  );
}

/**
 * Fetches a raw OrderRow by ID for internal payment resolution workflows.
 */
function findOrderRowById(id: string): OrderRow | null {
  return (
    (database
      .prepare(`SELECT ${orderColumns} FROM orders WHERE id=?`)
      .get(id) as OrderRow | undefined) ?? null
  );
}

/**
 * Updates a processing payment attempt to its terminal status (succeeded or failed)
 * with the provider reference and failure code, clearing scheduled reconciliation.
 */
function updatePaymentAttemptTerminalStatus(
  id: string,
  outcome: "succeeded" | "declined",
  reference: string,
  failure: string | null,
  now: number,
): void {
  database
    .prepare(
      `UPDATE payment_attempts
       SET status=?,provider_reference=?,failure_code=?,next_reconcile_at=NULL,
           last_reconcile_error=NULL,updated_at=?
       WHERE id=? AND status='processing'`,
    )
    .run(
      outcome === "succeeded" ? "succeeded" : "failed",
      reference,
      failure,
      now,
      id,
    );
}

/**
 * Applies a guarded status transition to the Order following payment resolution.
 * If payment succeeded, transitions payment_processing -> complete.
 * If payment was declined, transitions payment_processing -> pending (if not yet expired)
 * or -> expired (if the expiration deadline has passed). Returns the updated OrderRow
 * or null if the guarded status no longer matched.
 */
function transitionOrderOnPaymentResolution(
  orderId: string,
  outcome: "succeeded" | "declined",
  now: number,
): OrderRow | null {
  if (outcome === "succeeded") {
    return (
      (database
        .prepare(
          `UPDATE orders
           SET status='complete',version=version+1,updated_at=?
           WHERE id=? AND status='payment_processing'
           RETURNING ${orderColumns}`,
        )
        .get(now, orderId) as OrderRow | undefined) ?? null
    );
  }

  return (
    (database
      .prepare(
        `UPDATE orders
         SET status=CASE WHEN expires_at>? THEN 'pending' ELSE 'expired' END,
             version=version+1,updated_at=?
         WHERE id=? AND status='payment_processing'
         RETURNING ${orderColumns}`,
      )
      .get(now, now, orderId) as OrderRow | undefined) ?? null
  );
}

/**
 * Enqueues a durable event publication (order.completed or order.expired) when
 * an order transitions to a terminal state. No-ops for non-terminal orders.
 */
function enqueueTerminalOrderEvent(order: OrderRow): void {
  if (order.status !== "complete" && order.status !== "expired") {
    return;
  }

  enqueueOrderEventPublication({
    id: randomUUID(),
    aggregateType: "order",
    aggregateId: order.id,
    aggregateVersion: order.version,
    eventType: order.status === "complete" ? "order.completed" : "order.expired",
    eventVersion: 1,
    payload: { ticketId: order.ticket_id },
  });
}

export {
  beginPayment,
  dueAttempts,
  processing,
  progressPaymentAttempt,
  resolveAttempt,
  rowByKey,
  scheduleAttempt,
  updateProviderReference,
};
export type { BeginPaymentResult, ProgressPaymentAttemptResult };

