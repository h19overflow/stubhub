import { requireAuth } from "@stubhub/common";
import { Router } from "express";
import {
  parsePaymentCommand,
  submitOrderPayment,
} from "../../payments/payment-workflow.js";

const router = Router();

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
