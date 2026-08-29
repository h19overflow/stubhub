import { AppError } from "../http/app-error.js";
import { findOrderByIdForUser } from "../orders/order-repo.js";
import type { Order } from "../orders/order.js";
import { verify } from "../tickets-client.js";
import { submit } from "./local-provider.js";
import {
  beginPayment,
  processing,
  resolveAttempt,
  rowByKey,
  updateProviderReference,
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

function paymentResult(order: Order, attempt: PaymentAttempt): PaymentResult {
  const outcome =
    attempt.status === "succeeded"
      ? "succeeded"
      : attempt.status === "failed"
        ? "declined"
        : "processing";
  return { outcome, order, paymentAttempt: attempt };
}

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

  updateProviderReference(begun.attemptRow, provider.reference, Date.now());
  if (provider.status === "processing") {
    return paymentResult(begun.order, {
      ...begun.attempt,
      providerReference: provider.reference,
    });
  }

  const resolved = resolveAttempt(
    begun.attempt.id,
    provider.status === "succeeded" ? "succeeded" : "declined",
    provider.reference,
    provider.failureCode,
    Date.now(),
  );
  if (!resolved) throw new Error("payment resolution missing");
  return paymentResult(resolved.order, resolved.attempt);
}

export { parsePaymentCommand, submitOrderPayment };
