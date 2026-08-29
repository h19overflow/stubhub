import { requireAuth } from "@stubhub/common";
import { Router } from "express";
import type { Response } from "express";
import { AppError } from "../app-error.js";
import { findOrderByIdForUser } from "../../orders/order-repo.js";
import type { Order } from "../../orders/order.js";
import {
  beginPayment,
  processing,
  resolveAttempt,
  rowByKey,
  updateProviderReference,
} from "../../payments/payment-attempt-repo.js";
import { toPaymentAttempt } from "../../payments/payment-attempt.js";
import type {
  PaymentAttempt,
  ProviderScenario,
} from "../../payments/payment-attempt.js";
import { submit } from "../../payments/local-provider.js";
import { verify } from "../../tickets-client.js";

const router = Router();
const scenarios = new Set<ProviderScenario>([
  "local.success",
  "local.decline",
  "local.processing-success",
  "local.processing-decline",
]);

function paymentResponse(
  response: Response,
  order: Order,
  attempt: PaymentAttempt,
): void {
  const outcome =
    attempt.status === "succeeded"
      ? "succeeded"
      : attempt.status === "failed"
        ? "declined"
        : "processing";
  if (outcome === "processing") response.set("Retry-After", "2");
  response.status(outcome === "processing" ? 202 : 200).json({
    outcome,
    order,
    paymentAttempt: attempt,
  });
}

router.post<{ orderId: string }>(
  "/orders/:orderId/payments",
  requireAuth,
  async (request, response, next) => {
    try {
      const key = request.get("Idempotency-Key");
      if (!key || key.length > 128 || !/^[\x21-\x7e]+$/.test(key)) {
        throw new AppError(
          400,
          "invalid_idempotency_key",
          "Invalid Idempotency-Key",
        );
      }
      if (
        !request.body ||
        Object.keys(request.body).length !== 1 ||
        !scenarios.has(request.body.paymentMethodToken)
      ) {
        throw new AppError(400, "invalid_payment", "Invalid payment");
      }

      const scenario = request.body.paymentMethodToken as ProviderScenario;
      const userId = response.locals.user.id as string;
      const order = findOrderByIdForUser(userId, request.params.orderId);
      if (!order) {
        throw new AppError(404, "order_not_found", "Order not found");
      }

      const same = rowByKey(order.id, key);
      if (same) {
        if (same.request_fingerprint !== scenario) {
          throw new AppError(
            409,
            "idempotency_conflict",
            "Idempotency key conflict",
          );
        }
        paymentResponse(response, order, toPaymentAttempt(same));
        return;
      }

      const active = processing(order.id);
      if (active) {
        paymentResponse(response, order, toPaymentAttempt(active));
        return;
      }
      if (
        order.status !== "pending" ||
        Date.parse(order.expiresAt) <= Date.now()
      ) {
        throw new AppError(409, "order_not_payable", "Order is not payable");
      }

      await verify(order.ticketId, order.id);
      const begun = beginPayment(userId, order.id, key, scenario, Date.now());
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
        paymentResponse(response, begun.order, begun.attempt);
        return;
      }

      let provider;
      try {
        provider = submit(
          begun.attempt.id,
          scenario,
          begun.order.amountCents,
          begun.order.currency,
          Date.now(),
        );
      } catch {
        paymentResponse(response, begun.order, begun.attempt);
        return;
      }

      updateProviderReference(begun.attemptRow, provider.reference, Date.now());
      if (provider.status === "processing") {
        paymentResponse(response, begun.order, {
          ...begun.attempt,
          providerReference: provider.reference,
        });
        return;
      }

      const resolved = resolveAttempt(
        begun.attempt.id,
        provider.status === "succeeded" ? "succeeded" : "declined",
        provider.reference,
        provider.failureCode,
        Date.now(),
      );
      if (!resolved) throw new Error("payment resolution missing");
      paymentResponse(response, resolved.order, resolved.attempt);
    } catch (error) {
      next(error);
    }
  },
);

export { router as submitPayment };
