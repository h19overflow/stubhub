type PaymentStatus = "processing" | "succeeded" | "failed";
type ProviderScenario =
  | "local.success"
  | "local.decline"
  | "local.processing-success"
  | "local.processing-decline";

type PaymentAttemptRow = {
  id: string;
  order_id: string;
  status: PaymentStatus;
  provider_scenario: ProviderScenario;
  provider_reference: string | null;
  failure_code: string | null;
  idempotency_key: string;
  request_fingerprint: string;
  reconcile_attempt_count: number;
  next_reconcile_at: number | null;
  last_reconcile_error: string | null;
  created_at: number;
  updated_at: number;
};

type PaymentAttempt = {
  id: string;
  orderId: string;
  status: PaymentStatus;
  providerReference: string | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Projects a PaymentAttemptRow to the public API shape (ISO dates, camelCase).
 *
 * Flow: payment-workflow and HTTP routes map DB rows through this so internal
 * columns (reconcile counters, fingerprints) never leak. Converts created_at/
 * updated_at ms to ISO strings.
 */
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
  PaymentAttempt,
  PaymentAttemptRow,
  PaymentStatus,
  ProviderScenario,
};
