import { requireAuth } from "@stubhub/common";
import { Router } from "express";

const router = Router();

router.post("/orders/:orderId/payments", requireAuth, (_request, response) => {
  response.status(501).json({ error: "Not implemented" });
});

export { router as submitPayment };
