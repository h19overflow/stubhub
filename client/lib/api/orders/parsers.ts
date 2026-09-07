import {
  ensureObject,
  parseOrder,
  parsePaymentAttempt,
  type Order,
} from "../commerce-types";
import type { PaymentResult, StartOrderResult } from "./types";

const object = ensureObject;

export function parseOrderList(value: unknown): Order[] {
  const body = object(value);
  if (!Array.isArray(body.orders)) {
    throw new Error("Invalid service response");
  }
  return body.orders.map(parseOrder);
}

export function parseStartOrder(value: unknown): StartOrderResult {
  const body = object(value);
  if (body.outcome === "processing") return { outcome: "processing" };
  if (body.outcome !== "created" && body.outcome !== "replayed") {
    throw new Error("Invalid service response");
  }
  return { outcome: body.outcome, order: parseOrder(body.order) };
}

export function parsePayment(value: unknown): PaymentResult {
  const body = object(value);
  if (
    body.outcome !== "succeeded" &&
    body.outcome !== "declined" &&
    body.outcome !== "processing"
  ) {
    throw new Error("Invalid service response");
  }
  return {
    outcome: body.outcome,
    order: parseOrder(body.order),
    paymentAttempt: parsePaymentAttempt(body.paymentAttempt),
  };
}
