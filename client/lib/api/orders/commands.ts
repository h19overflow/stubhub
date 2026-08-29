import { apiRequest, jsonBody } from "../request";
import { parsePayment, parseStartOrder } from "./parsers";
import type {
  PaymentMethodToken,
  PaymentResult,
  StartOrderResult,
} from "./types";

const base = "/api/orders";

export function startOrder(
  ticketId: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<StartOrderResult> {
  return apiRequest(`${base}/orders`, {
    body: jsonBody({ ticketId }),
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
    parse: parseStartOrder,
    protected: true,
    signal,
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
