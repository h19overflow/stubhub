import { useEffect, useRef, useState } from "react";
import type { Order, OrderStatus } from "../../lib/api/commerce-types";
import { submitPayment } from "../../lib/api/orders/commands";
import type {
  PaymentMethodToken,
  PaymentResult,
} from "../../lib/api/orders/types";
import { ApiError } from "../../lib/api/request";
import { orderErrorMessage } from "./order-hook-state";

type PaymentState = "idle" | "submitting" | "processing" | "declined" | "error";

// The hook sends a provider token, never raw card details.
export function usePayment(
  orderId: string,
  orderStatus: OrderStatus,
  onOrder: (order: Order) => void,
) {
  // Lock the first token to one idempotency key for the attempt.
  const attempt = useRef<{ key: string; token: PaymentMethodToken } | null>(null);
  const [lockedToken, setLockedToken] = useState<PaymentMethodToken | null>(null);
  const [status, setStatus] = useState<PaymentState>("idle");
  const [feedback, setFeedback] = useState("");

  // Resolve processing UI from the latest server-owned order status.
  useEffect(() => {
    if (status !== "processing") return;
    if (orderStatus === "pending") {
      attempt.current = null;
      setLockedToken(null);
      setStatus("declined");
      setFeedback(
        "Payment was declined. You can choose another outcome and retry.",
      );
    } else if (orderStatus === "complete" || orderStatus === "expired") {
      attempt.current = null;
      setLockedToken(null);
    }
  }, [orderStatus, status]);

  async function pay(
    requestedToken: PaymentMethodToken,
  ): Promise<PaymentResult | null> {
    // Retries reuse the first token and key.
    if (!attempt.current) {
      attempt.current = { key: crypto.randomUUID(), token: requestedToken };
      setLockedToken(requestedToken);
    }
    const currentAttempt = attempt.current;

    setStatus("submitting");
    setFeedback("");
    try {
      const result = await submitPayment(
        orderId,
        currentAttempt.token,
        currentAttempt.key,
      );
      onOrder(result.order);

      // Processing keeps the lock until polling resolves the order.
      if (result.outcome === "processing") {
        setStatus("processing");
        setFeedback(
          "Payment is processing. This page will update automatically.",
        );
      } else if (result.outcome === "declined") {
        attempt.current = null;
        setLockedToken(null);
        setStatus("declined");
        setFeedback(
          "Payment was declined. You can choose another outcome and retry.",
        );
      } else {
        attempt.current = null;
        setLockedToken(null);
        setStatus("idle");
        setFeedback("Payment confirmed.");
      }
      return result;
    } catch (error) {
      // A 4xx ends the attempt; temporary failures preserve the key for retry.
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        attempt.current = null;
        setLockedToken(null);
      }
      setStatus("error");
      setFeedback(
        `${orderErrorMessage(error)}${attempt.current ? " Retry will use the same payment outcome." : ""}`,
      );
      return null;
    }
  }

  return { feedback, lockedToken, pay, status };
}
