import { AppError } from "../http/app-error.js";
import { release, reserve } from "../tickets-client.js";
import {
  completePurchase,
  createPurchase,
  findOrderRow,
  findPurchase,
  findPurchaseByOrderId,
  rejectPurchase,
  schedulePurchase,
} from "./order-repo.js";
import type { PurchaseRow } from "./order-repo.js";
import { toOrder } from "./order.js";
import type { Order } from "./order.js";

type PurchaseResult = "completed" | "rejected" | "processing";
type CreateOrderCommand = {
  userId: string;
  idempotencyKey: string;
  ticketId: string;
};
type StartPurchaseResult =
  | { outcome: "created" | "replayed"; order: Order }
  | { outcome: "processing" };

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates the caller-supplied key used to replay a purchase safely.
 *
 * The key must be a bounded printable string because Orders persists it as the
 * stable identity that distinguishes a retry from a different purchase request.
 */
function idempotencyKey(value: unknown): string {
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

/**
 * Validates the authenticated purchase input and carries the trusted user ID,
 * stable idempotency key, and Ticket ID into the workflow.
 */
function parseCreateOrderCommand(
  userId: string,
  key: unknown,
  body: unknown,
): CreateOrderCommand {
  const parsedKey = idempotencyKey(key);
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("ticketId" in body) ||
    typeof body.ticketId !== "string" ||
    !uuid.test(body.ticketId)
  ) {
    throw new AppError(400, "invalid_order", "Invalid order");
  }

  return { userId, idempotencyKey: parsedKey, ticketId: body.ticketId };
}

/**
 * Reloads the durable purchase operation after another attempt may have won a
 * guarded update, then reduces its persisted state to the workflow result.
 */
function currentResult(orderId: string): PurchaseResult {
  const operation = findPurchaseByOrderId(orderId);
  if (!operation) throw new Error("purchase operation missing");
  if (operation.state === "completed") return "completed";
  if (operation.state === "rejected") return "rejected";
  return "processing";
}

/**
 * Converges an expired or abandoned reservation operation toward rejection.
 *
 * A guarded update first persists the releasing state. Tickets release is safe
 * to retry for the same Order, and a transient failure persists another retry
 * instead of pretending the reservation was released.
 */
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

/**
 * Resumes one purchase operation from its current durable state.
 *
 * Every entry rereads the row, so startup workers can pass an older scan result
 * safely. Terminal rows return immediately; expired work enters release;
 * successful reservation completes the durable Order; known business failures
 * reject it; transient failures persist a future retry.
 */
async function processPurchase(
  operation: PurchaseRow,
): Promise<PurchaseResult> {
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

/**
 * Converts a persisted terminal rejection code into the public HTTP error that
 * the original or replayed purchase request should receive.
 */
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

/**
 * Starts or replays a purchase under the caller's idempotency key.
 *
 * createPurchase durably stores the recovery operation and allocates its future
 * Order ID before the Tickets call. An immediate attempt improves response time,
 * while a processing result leaves that operation for the startup/recurring worker.
 */
async function startPurchase(
  command: CreateOrderCommand,
): Promise<StartPurchaseResult> {
  const created = createPurchase(
    command.userId,
    command.idempotencyKey,
    command.ticketId,
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
  const current = findPurchase(command.userId, command.idempotencyKey);
  if (!current) throw new Error("purchase operation missing");
  if (result === "rejected") throw rejectedPurchaseError(current);

  const order = findOrderRow(created.operation.order_id);
  if (result === "completed" && order) {
    return { outcome: created.kind, order: toOrder(order) };
  }

  return { outcome: "processing" };
}

export { parseCreateOrderCommand, processPurchase, startPurchase };
