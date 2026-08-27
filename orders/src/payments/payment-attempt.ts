/** One provider attempt moves once from `processing` to `succeeded` or `failed`. */
type PaymentAttemptStatus = "processing" | "succeeded" | "failed";

/**
 * Public record of one payment-provider submission.
 * Successful attempts record a provider reference; failed attempts record a failure code.
 */
type PaymentAttempt = {
  id: string;
  orderId: string;
  status: PaymentAttemptStatus;
  providerReference: string | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
};

/** SQLite shape, including retry metadata that is not exposed on `PaymentAttempt`. */
type PaymentAttemptRow = {
  id: string;
  order_id: string;
  status: PaymentAttemptStatus;
  provider_reference: string | null;
  failure_code: string | null;
  idempotency_key: string;
  request_fingerprint: string;
  created_at: number;
  updated_at: number;
};

/** Data needed to create or safely replay one payment attempt. */
type CreatePaymentAttemptInput = {
  id: string;
  orderId: string;
  idempotencyKey: string;
  requestFingerprint: string;
};

/**
 * `replayed` returns the prior attempt for the same request.
 * `conflict` means one key described different data; `already_processing` means
 * a different request already owns the Order's single processing slot.
 */
type CreatePaymentAttemptResult =
  | { outcome: "created"; attempt: PaymentAttempt }
  | { outcome: "replayed"; attempt: PaymentAttempt }
  | { outcome: "conflict" }
  | { outcome: "already_processing"; attempt: PaymentAttempt };

function toPaymentAttempt(row: PaymentAttemptRow): PaymentAttempt {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    providerReference: row.provider_reference,
    failureCode: row.failure_code,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export { toPaymentAttempt };
export type {
  CreatePaymentAttemptInput,
  CreatePaymentAttemptResult,
  PaymentAttempt,
  PaymentAttemptRow,
  PaymentAttemptStatus,
};
