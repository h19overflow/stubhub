import { requireAuth } from "@stubhub/common";
import { Router } from "express";
import {
  findOrderByIdForUser,
  listOrdersForUser,
} from "../../orders/order-repo.js";
import { AppError } from "../app-error.js";

const router = Router();

/**
 * GET /orders/mine — lists caller's orders (active + completed) for My Orders.
 *
 * Flow: requireAuth → listOrdersForUser(userId) → 200 {orders}. Uses shared
 * Orders DB; history includes pending/payment_processing/complete/expired.
 */
router.get("/orders/mine", requireAuth, (_request, response) => {
  response.status(200).json({
    orders: listOrdersForUser(response.locals.user.id),
  });
});

/**
 * GET /orders/:orderId — fetches one order owned by caller.
 *
 * Flow: requireAuth → findOrderByIdForUser(userId, orderId) → 404 order_not_found
 * if not owned/missing; else 200 {order}. Used for poll/detail + countdown UI.
 */
router.get<{ orderId: string }>(
  "/orders/:orderId",
  requireAuth,
  (request, response, next) => {
    try {
      const order = findOrderByIdForUser(
        response.locals.user.id,
        request.params.orderId,
      );
      if (!order) {
        throw new AppError(404, "order_not_found", "Order not found");
      }
      response.status(200).json({ order });
    } catch (error) {
      next(error);
    }
  },
);

export { router as listOrders };
