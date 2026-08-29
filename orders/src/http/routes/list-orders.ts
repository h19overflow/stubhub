import { requireAuth } from "@stubhub/common";
import { Router } from "express";
import {
  findOrderByIdForUser,
  listOrdersForUser,
} from "../../orders/order-repo.js";
import { AppError } from "../app-error.js";

const router = Router();

router.get("/orders/mine", requireAuth, (_request, response) => {
  response.status(200).json({
    orders: listOrdersForUser(response.locals.user.id),
  });
});

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
