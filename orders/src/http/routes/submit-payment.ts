import { requireAuth } from "@stubhub/common";
import { Router } from "express";
import {
  parsePaymentCommand,
  submitOrderPayment,
} from "../../payments/payment-workflow.js";

const router = Router();

/**
 * POST /orders/:orderId/payments — submits a payment for a pending order (idempotent).
 *
 * Flow: requireAuth → parsePaymentCommand (Idempotency-Key + {paymentMethodToken}
 * must be a ProviderScenario) → submitOrderPayment (ownership check 404,
 * replay check 409, processing guard, expiry/order status 409 order_not_payable,
 * verify() reservation, beginPayment, local provider submit, updateProviderReference,
 * resolveAttempt) → processing→202+Retry-After:2, succeeded/declined→200
 * {outcome,order,paymentAttempt}. verify() rechecks Tickets authority before handling money.
 */
router.post<{ orderId: string }>(
  "/orders/:orderId/payments",
  requireAuth,
  async (request, response, next) => {
    try {
      const command = parsePaymentCommand(
        response.locals.user.id as string,
        request.params.orderId,
        request.get("Idempotency-Key"),
        request.body,
      );
      const result = await submitOrderPayment(command);

      if (result.outcome === "processing") {
        response.set("Retry-After", "2");
      }
      response.status(result.outcome === "processing" ? 202 : 200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

export { router as submitPayment };
