import { apiRequest, jsonBody } from "../request";
import {
  parseOrder,
  parsePaymentAttempt,
  type Order,
  type PaymentAttempt,
  wrapped,
} from "../commerce-types";

const base = "/api/orders";

export type PaymentMethodToken =
  | "local.success"
  | "local.decline"
  | "local.processing-success"
  | "local.processing-decline";

export type StartOrderResult =
  | { outcome: "created" | "replayed"; order: Order }
  | { outcome: "processing" };

export type PaymentResult = {
  outcome: "succeeded" | "declined" | "processing";
  order: Order;
  paymentAttempt: PaymentAttempt;
};

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid service response");
  }
  return value as Record<string, unknown>;
}

function parseStart(value: unknown): StartOrderResult {
  const body = object(value);
  if (body.outcome === "processing") return { outcome: "processing" };
  if (body.outcome !== "created" && body.outcome !== "replayed") {
    throw new Error("Invalid service response");
  }
  return { outcome: body.outcome, order: parseOrder(body.order) };
}

function parsePayment(value: unknown): PaymentResult {
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

export function startOrder(
  ticketId: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<StartOrderResult> {
  return apiRequest(`${base}/orders`, {
    body: jsonBody({ ticketId }),
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
    parse: parseStart,
    protected: true,
    signal,
  });
}

export function listMyOrders(): Promise<Order[]> {
  return apiRequest(`${base}/orders/mine`, {
    parse: (value) => {
      const body = object(value);
      if (!Array.isArray(body.orders)) throw new Error("Invalid service response");
      return body.orders.map(parseOrder);
    },
    protected: true,
  });
}

export function getOrder(orderId: string): Promise<Order> {
  return apiRequest(`${base}/orders/${encodeURIComponent(orderId)}`, {
    parse: wrapped("order", parseOrder),
    protected: true,
  });
}

export function submitPayment(
  orderId: string,
  paymentMethodToken: PaymentMethodToken,
  idempotencyKey: string,
): Promise<PaymentResult> {
  return apiRequest(`${base}/orders/${encodeURIComponent(orderId)}/payments`, {
    body: jsonBody({ paymentMethodToken }),
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
    parse: parsePayment,
    protected: true,
  });
}
