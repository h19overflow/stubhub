import type { Order, PaymentAttempt } from "../commerce-types";

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
