import { AppError } from "../http/app-error.js";
import { findOrderByIdForUser } from "../orders/order-repo.js";
import type { Order } from "../orders/order.js";
import { verify } from "../tickets-client.js";
import { submit } from "./local-provider.js";
import {
  beginPayment,
  processing,
  progressPaymentAttempt,
  rowByKey,
} from "./payment-attempt-repo.js";
import { toPaymentAttempt } from "./payment-attempt.js";
import type {
  PaymentAttempt,
  ProviderScenario,
} from "./payment-attempt.js";

type PaymentCommand = {
  userId: string;
  orderId: string;
  idempotencyKey: string;
  scenario: ProviderScenario;
};
type PaymentOutcome = "succeeded" | "declined" | "processing";
type PaymentResult = {
  outcome: PaymentOutcome;
  order: Order;
  paymentAttempt: PaymentAttempt;
};

const scenarios = new Set<ProviderScenario>([
  "local.success",
  "local.decline",
  "local.processing-success",
  "local.processing-decline",
]);

/**
 * Validates the POST /orders/:id/pay body and Idempotency-Key into a command.
 *
 * Flow: HTTP layer -> calls this with userId, orderId, key, body. Validates
 * key is 1-128 printable chars and body has single paymentMethodToken in the
 * allowed ProviderScenario set. Throws 400 AppError on invalid input. Returns
 * trusted PaymentCommand for submitOrderPayment.
 */
function parsePaymentCommand(
  userId: string,
  orderId: string,
  key: unknown,
  body: unknown,
): PaymentCommand {
  if (
    typeof key !== "string" ||
    key.length < 1 ||
    key.length > 128 ||
    !/^[\x21-\x7e]+$/.test(key)
  ) {
    throw new AppError(
      400,
      "invalid_idempotency_key",
      "Invalid Idempotency-Key",
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("paymentMethodToken" in body) ||
    typeof body.paymentMethodToken !== "string" ||
    !scenarios.has(body.paymentMethodToken as ProviderScenario)
  ) {
    throw new AppError(400, "invalid_payment", "Invalid payment");
  }

  return {
    userId,
    orderId,
    idempotencyKey: key,
    scenario: body.paymentMethodToken as ProviderScenario,
  };
}

/**
 * Reduces a persisted PaymentAttempt status to the public PaymentResult shape.
 *
 * Flow: maps succeeded->succeeded, failed->declined, processing->processing
 * and pairs with the Order. Used for both new submissions and idempotent
 * replays so response is consistent.
 */
function paymentResult(order: Order, attempt: PaymentAttempt): PaymentResult {
  const outcome =
    attempt.status === "succeeded"
      ? "succeeded"
      : attempt.status === "failed"
        ? "declined"
        : "processing";
  return { outcome, order, paymentAttempt: attempt };
}

/**
 * Submits a payment for an Order with idempotency and reservation verification.
 *
 * Flow: POST /orders/:id/pay -> parsePaymentCommand -> calls this. Steps:
 * 1) findOrderByIdForUser (404 if not owned), 2) rowByKey replay check
 * (409 on fingerprint mismatch), 3) processing() check (return existing
 * processing attempt), 4) status/expiry gate (409 order_not_payable),
 * 5) verify() reservation still held, 6) beginPayment (creates processing row
 * with guarded insert), 7) submit to local provider, 8) updateProviderReference
 * 9) if processing return, else resolveAttempt. Each guard makes retries safe;
 * verify ensures Tickets rechecks availability.
 */
async function submitOrderPayment(
  command: PaymentCommand,
): Promise<PaymentResult> {
  const order = findOrderByIdForUser(command.userId, command.orderId);
  if (!order) {
    throw new AppError(404, "order_not_found", "Order not found");
  }

  const same = rowByKey(order.id, command.idempotencyKey);
  if (same) {
    if (same.request_fingerprint !== command.scenario) {
      throw new AppError(
        409,
        "idempotency_conflict",
        "Idempotency key conflict",
      );
    }
    return paymentResult(order, toPaymentAttempt(same));
  }

  const active = processing(order.id);
  if (active) {
    return paymentResult(order, toPaymentAttempt(active));
  }
  if (
    order.status !== "pending" ||
    Date.parse(order.expiresAt) <= Date.now()
  ) {
    throw new AppError(409, "order_not_payable", "Order is not payable");
  }

  await verify(order.ticketId, order.id);
  const begun = beginPayment(
    command.userId,
    order.id,
    command.idempotencyKey,
    command.scenario,
    Date.now(),
  );
  if (begun.kind === "conflict") {
    throw new AppError(
      409,
      "idempotency_conflict",
      "Idempotency key conflict",
    );
  }
  if (begun.kind === "not_payable") {
    throw new AppError(409, "order_not_payable", "Order is not payable");
  }
  if (begun.kind === "replayed" || begun.kind === "processing") {
    return paymentResult(begun.order, begun.attempt);
  }

  let provider;
  try {
    provider = submit(
      begun.attempt.id,
      command.scenario,
      begun.order.amountCents,
      begun.order.currency,
      Date.now(),
    );
  } catch {
    return paymentResult(begun.order, begun.attempt);
  }

  const progressed = progressPaymentAttempt(
    begun.attemptRow,
    provider,
    Date.now(),
  );
  if (!progressed) {
    return paymentResult(begun.order, begun.attempt);
  }
  return paymentResult(progressed.order ?? begun.order, progressed.attempt);
}

export { parsePaymentCommand, submitOrderPayment };
