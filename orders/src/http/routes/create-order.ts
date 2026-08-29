import { requireAuth } from "@stubhub/common";
import { Router } from "express";
import { AppError } from "../app-error.js";
import {
  completePurchase,
  createPurchase,
  findOrderRow,
  findPurchase,
  findPurchaseByOrderId,
  rejectPurchase,
  schedulePurchase,
} from "../../orders/order-repo.js";
import type { PurchaseRow } from "../../orders/order-repo.js";
import { toOrder } from "../../orders/order.js";
import { release, reserve } from "../../tickets-client.js";

type PurchaseResult = "completed" | "rejected" | "processing";

const router = Router();
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function keyOf(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw new AppError(
      400,
      "invalid_idempotency_key",
      "Invalid Idempotency-Key",
    );
  }
  return value;
}

function currentResult(orderId: string): PurchaseResult {
  const operation = findPurchaseByOrderId(orderId);
  if (!operation) throw new Error("purchase operation missing");
  if (operation.state === "completed") return "completed";
  if (operation.state === "rejected") return "rejected";
  return "processing";
}

async function processRelease(operation: PurchaseRow): Promise<PurchaseResult> {
  let current = operation;
  const now = Date.now();

  if (current.state === "reserving") {
    const claimed = schedulePurchase(
      current,
      "releasing",
      "purchase deadline elapsed",
      now,
    );
    if (!claimed) return currentResult(current.order_id);

    const refreshed = findPurchaseByOrderId(current.order_id);
    if (!refreshed) throw new Error("purchase operation missing");
    current = refreshed;
  }
  if (current.state !== "releasing") return currentResult(current.order_id);

  try {
    await release(current.ticket_id, current.order_id);
    rejectPurchase(
      current.order_id,
      "releasing",
      "ticket_unavailable",
      Date.now(),
    );
  } catch (error) {
    schedulePurchase(
      current,
      "releasing",
      error instanceof Error ? error.message : "release failed",
      Date.now(),
    );
  }
  return currentResult(current.order_id);
}

async function processPurchase(operation: PurchaseRow): Promise<PurchaseResult> {
  const durable = findPurchaseByOrderId(operation.order_id);
  if (!durable) throw new Error("purchase operation missing");
  if (durable.state === "completed") return "completed";
  if (durable.state === "rejected") return "rejected";
  if (durable.state === "releasing" || durable.expires_at <= Date.now()) {
    return processRelease(durable);
  }

  try {
    const reservation = await reserve(
      durable.ticket_id,
      durable.order_id,
      durable.expires_at,
    );
    const order = completePurchase(durable, reservation, Date.now());
    if (order) return "completed";

    const refreshed = findPurchaseByOrderId(durable.order_id);
    if (!refreshed) throw new Error("purchase operation missing");
    if (refreshed.state === "reserving" && refreshed.expires_at > Date.now()) {
      throw new Error("purchase completion guard failed");
    }
    return processRelease(refreshed);
  } catch (error) {
    if (
      error instanceof AppError &&
      (error.code === "ticket_not_found" ||
        error.code === "ticket_unavailable" ||
        error.code === "reservation_conflict")
    ) {
      rejectPurchase(
        durable.order_id,
        "reserving",
        error.code,
        Date.now(),
      );
      return currentResult(durable.order_id);
    }

    schedulePurchase(
      durable,
      "reserving",
      error instanceof Error ? error.message : "reservation failed",
      Date.now(),
    );
    return currentResult(durable.order_id);
  }
}

function rejectedPurchaseError(operation: PurchaseRow): AppError {
  if (operation.rejection_code === "ticket_not_found") {
    return new AppError(404, "ticket_not_found", "Ticket not found");
  }
  if (operation.rejection_code === "reservation_conflict") {
    return new AppError(
      409,
      "reservation_conflict",
      "Reservation deadline conflicts",
    );
  }
  return new AppError(409, "ticket_unavailable", "Ticket unavailable");
}

router.post("/orders", requireAuth, async (request, response, next) => {
  try {
    const key = keyOf(request.get("Idempotency-Key"));
    if (
      !request.body ||
      Object.keys(request.body).length !== 1 ||
      typeof request.body.ticketId !== "string" ||
      !uuid.test(request.body.ticketId)
    ) {
      throw new AppError(400, "invalid_order", "Invalid order");
    }

    const userId = response.locals.user.id as string;
    const created = createPurchase(
      userId,
      key,
      request.body.ticketId,
      Date.now(),
    );
    if (created.kind === "conflict") {
      throw new AppError(
        409,
        "idempotency_conflict",
        "Idempotency key conflict",
      );
    }

    const result = await processPurchase(created.operation);
    const current = findPurchase(userId, key);
    if (!current) throw new Error("purchase operation missing");
    if (result === "rejected") throw rejectedPurchaseError(current);

    const order = findOrderRow(created.operation.order_id);
    if (result === "completed" && order) {
      response.status(created.kind === "created" ? 201 : 200).json({
        outcome: created.kind,
        order: toOrder(order),
      });
      return;
    }

    response.set("Retry-After", "2").status(202).json({ outcome: "processing" });
  } catch (error) {
    next(error);
  }
});

export { processPurchase, router as createOrder };
