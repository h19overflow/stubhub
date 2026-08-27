import { requireAuth } from "@stubhub/common";
import { Router } from "express";
import { createOrder } from "../../orders/order-repo.js";

const router = Router();

router.post("/orders", requireAuth, (request, response) => {
  const now = Date.now();
  const order = createOrder(request.body, now);
  response.status(201).json(order);
});

export { router as createOrder };
