import { requireAuth } from "@stubhub/common";
import { Router } from "express";
import {
  parseCreateOrderCommand,
  startPurchase,
} from "../../orders/purchase-workflow.js";

const router = Router();

router.post("/orders", requireAuth, async (request, response, next) => {
  try {
    const command = parseCreateOrderCommand(
      response.locals.user.id as string,
      request.get("Idempotency-Key"),
      request.body,
    );
    const result = await startPurchase(command);

    if (result.outcome === "processing") {
      response
        .set("Retry-After", "2")
        .status(202)
        .json({ outcome: "processing" });
      return;
    }

    response
      .status(result.outcome === "created" ? 201 : 200)
      .json(result);
  } catch (error) {
    next(error);
  }
});

export { router as createOrder };
