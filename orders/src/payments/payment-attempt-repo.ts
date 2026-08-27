import { database } from "../database.js";
import { toPaymentAttempt } from "./payment-attempt.js";
import type {
  CreatePaymentAttemptInput,
  CreatePaymentAttemptResult,
  PaymentAttempt,
  PaymentAttemptRow,
} from "./payment-attempt.js";

const paymentAttemptColumns = `
  id,
  order_id,
  status,
  provider_reference,
  failure_code,
  idempotency_key,
  request_fingerprint,
  created_at,
  updated_at
`;

function readPaymentAttemptByOrderAndId(orderId: string, attemptId: string): PaymentAttemptRow | null {
  const row = database
    .prepare(`SELECT ${paymentAttemptColumns} FROM payment_attempts WHERE order_id = ? AND id = ?`)
    .get(orderId, attemptId) as PaymentAttemptRow | undefined;
  return row ?? null;
}

function readPaymentAttemptByOrderAndKey(
  orderId: string,
  idempotencyKey: string,
): PaymentAttemptRow | null {
  const row = database
    .prepare(
      `SELECT ${paymentAttemptColumns}
       FROM payment_attempts
       WHERE order_id = ? AND idempotency_key = ?`,
    )
    .get(orderId, idempotencyKey) as PaymentAttemptRow | undefined;
  return row ?? null;
}

function readProcessingPaymentAttempt(orderId: string): PaymentAttemptRow | null {
  const row = database
    .prepare(
      `SELECT ${paymentAttemptColumns}
       FROM payment_attempts
       WHERE order_id = ? AND status = 'processing'`,
    )
    .get(orderId) as PaymentAttemptRow | undefined;
  return row ?? null;
}

function createPaymentAttempt(input: CreatePaymentAttemptInput): CreatePaymentAttemptResult {
  const now = Date.now();
  const inserted = database
    .prepare(
      `INSERT INTO payment_attempts (
        id,
        order_id,
        idempotency_key,
        request_fingerprint,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING`,
    )
    .run(
      input.id,
      input.orderId,
      input.idempotencyKey,
      input.requestFingerprint,
      now,
      now,
    );

  if (Number(inserted.changes) === 1) {
    const row = readPaymentAttemptByOrderAndId(input.orderId, input.id);
    if (!row) throw new Error("Created payment attempt could not be read");
    return { outcome: "created", attempt: toPaymentAttempt(row) };
  }

  const idempotentRow = readPaymentAttemptByOrderAndKey(input.orderId, input.idempotencyKey);
  if (idempotentRow) {
    if (idempotentRow.request_fingerprint === input.requestFingerprint) {
      return { outcome: "replayed", attempt: toPaymentAttempt(idempotentRow) };
    }
    return { outcome: "conflict" };
  }

  const processingRow = readProcessingPaymentAttempt(input.orderId);
  if (processingRow) {
    return { outcome: "already_processing", attempt: toPaymentAttempt(processingRow) };
  }

  throw new Error("Payment attempt could not be created");
}

function findPaymentAttemptById(orderId: string, attemptId: string): PaymentAttempt | null {
  const row = readPaymentAttemptByOrderAndId(orderId, attemptId);
  return row ? toPaymentAttempt(row) : null;
}

function findProcessingPaymentAttempt(orderId: string): PaymentAttempt | null {
  const row = readProcessingPaymentAttempt(orderId);
  return row ? toPaymentAttempt(row) : null;
}

function markPaymentAttemptSucceeded(
  orderId: string,
  attemptId: string,
  providerReference: string,
): PaymentAttempt | null {
  const updated = database
    .prepare(
      `UPDATE payment_attempts
       SET status = 'succeeded', provider_reference = ?, failure_code = NULL, updated_at = ?
       WHERE order_id = ? AND id = ? AND status = 'processing'`,
    )
    .run(providerReference, Date.now(), orderId, attemptId);

  if (Number(updated.changes) !== 1) return null;
  return findPaymentAttemptById(orderId, attemptId);
}

function markPaymentAttemptFailed(
  orderId: string,
  attemptId: string,
  failureCode: string,
): PaymentAttempt | null {
  const updated = database
    .prepare(
      `UPDATE payment_attempts
       SET status = 'failed', failure_code = ?, updated_at = ?
       WHERE order_id = ? AND id = ? AND status = 'processing'`,
    )
    .run(failureCode, Date.now(), orderId, attemptId);

  if (Number(updated.changes) !== 1) return null;
  return findPaymentAttemptById(orderId, attemptId);
}

export {
  createPaymentAttempt,
  findPaymentAttemptById,
  findProcessingPaymentAttempt,
  markPaymentAttemptFailed,
  markPaymentAttemptSucceeded,
};
