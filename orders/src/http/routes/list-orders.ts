import { requireAuth } from "@stubhub/common";
import { Router } from "express";
import { findOrderByIdForUser, listOrdersForUser } from "../../orders/order-repo.js";
const router = Router();

router.get("/orders/mine", requireAuth, (_request, response) => {
  const orders = listOrdersForUser(response.locals.user.id);
  response.status(200).json(orders);
});

router.get<{ orderId: string }>("/orders/:orderId", requireAuth, (request, response) => {
  const order = findOrderByIdForUser(response.locals.user.id, request.params.orderId);
  if (!order) {
    response.status(404).json({ error: "Order not found" });
    return;
  }

  response.status(200).json(order);
});

export { router as listOrders };
