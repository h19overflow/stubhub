import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/api/request";
import {
  getOrder,
  listMyOrders,
  startOrder,
  submitPayment,
  type PaymentMethodToken,
  type PaymentResult,
} from "../../lib/api/orders/client";
import type { Order, OrderStatus } from "../../lib/api/commerce-types";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

type PaymentState = "idle" | "submitting" | "processing" | "declined" | "error";
type StartOrderAction =
  | { outcome: "order"; order: Order }
  | { outcome: "rejected" | "unresolved" | "aborted" };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The service is temporarily unavailable";
}

// Cancellation clears the retry timer and stops the loop.
function wait(seconds: number, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => resolve(true), seconds * 1000);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve(false);
      },
      { once: true },
    );
  });
}

// The server derives the owner from authentication; no user ID is sent.
export function useOrders() {
  const [state, setState] = useState<LoadState<Order[]>>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await listMyOrders() });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}

export function useOrder(orderId: string | undefined) {
  const [state, setState] = useState<LoadState<Order>>({ status: "loading" });

  const load = useCallback(
    async (showLoading = true) => {
      if (!orderId) return;
      if (showLoading) setState({ status: "loading" });
      try {
        setState({ status: "ready", data: await getOrder(orderId) });
      } catch (error) {
        setState({ status: "error", message: errorMessage(error) });
      }
    },
    [orderId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while the server reports payment processing.
  useEffect(() => {
    if (state.status !== "ready" || state.data.status !== "payment_processing") return;
    const timer = window.setTimeout(() => void load(false), 2000);
    return () => window.clearTimeout(timer);
  }, [load, state]);

  function setOrder(order: Order) {
    setState({ status: "ready", data: order });
  }

  return { state, reload: load, setOrder };
}

// One logical ticket attempt reuses one idempotency key across retries.
export function useStartOrder(ticketId: string) {
  const logicalAttempt = useRef<{ ticketId: string; key: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [status, setStatus] = useState<
    "idle" | "processing" | "temporary_failure" | "rejected"
  >("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  // Changing tickets cancels old work and starts a new logical attempt.
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    logicalAttempt.current = { ticketId, key: crypto.randomUUID() };
    if (mounted.current) {
      setStatus("idle");
      setError("");
    }
  }, [ticketId]);

  function isActive(controller: AbortController) {
    return mounted.current && !controller.signal.aborted;
  }

  async function start(): Promise<StartOrderAction> {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;

    if (logicalAttempt.current?.ticketId !== ticketId) {
      logicalAttempt.current = { ticketId, key: crypto.randomUUID() };
    }
    const attempt = logicalAttempt.current;
    if (!attempt) return { outcome: "aborted" };

    if (isActive(controller)) {
      setStatus("processing");
      setError("");
    }

    try {
      // Retry processing responses up to five times with the same key.
      for (let retry = 0; retry < 5; retry += 1) {
        const result = await startOrder(ticketId, attempt.key, controller.signal);
        if (!isActive(controller)) return { outcome: "aborted" };
        if (result.outcome !== "processing") {
          setStatus("idle");
          return { outcome: "order", order: result.order };
        }
        if (retry < 4 && !(await wait(2, controller.signal))) {
          return { outcome: "aborted" };
        }
      }

      // Preserve the key so a later retry continues the same operation.
      if (isActive(controller)) {
        setStatus("temporary_failure");
        setError("Purchase is still processing. Retry to continue with the same request key.");
      }
      return { outcome: "unresolved" };
    } catch (cause) {
      if (!isActive(controller)) return { outcome: "aborted" };
      // A 4xx rejection clears the key; temporary failures keep it.
      const rejected = cause instanceof ApiError && cause.status >= 400 && cause.status < 500;
      if (rejected) logicalAttempt.current = null;
      setStatus(rejected ? "rejected" : "temporary_failure");
      setError(errorMessage(cause));
      return { outcome: rejected ? "rejected" : "unresolved" };
    }
  }

  return { error, start, status };
}

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
      setFeedback("Payment was declined. You can choose another outcome and retry.");
    } else if (orderStatus === "complete" || orderStatus === "expired") {
      attempt.current = null;
      setLockedToken(null);
    }
  }, [orderStatus, status]);

  async function pay(requestedToken: PaymentMethodToken): Promise<PaymentResult | null> {
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
        setFeedback("Payment is processing. This page will update automatically.");
      } else if (result.outcome === "declined") {
        attempt.current = null;
        setLockedToken(null);
        setStatus("declined");
        setFeedback("Payment was declined. You can choose another outcome and retry.");
      } else {
        attempt.current = null;
        setLockedToken(null);
        setStatus("idle");
        setFeedback("Payment confirmed.");
      }
      return result;
    } catch (error) {
      // A 4xx ends the attempt; temporary failures preserve the key for retry.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        attempt.current = null;
        setLockedToken(null);
      }
      setStatus("error");
      setFeedback(
        `${errorMessage(error)}${attempt.current ? " Retry will use the same payment outcome." : ""}`,
      );
      return null;
    }
  }

  return { feedback, lockedToken, pay, status };
}

// Return remaining milliseconds, clamped at zero.
export function useCountdown(expiresAt: string) {
  const remaining = () => Math.max(0, Date.parse(expiresAt) - Date.now());
  const [milliseconds, setMilliseconds] = useState(remaining);

  useEffect(() => {
    const timer = window.setInterval(() => setMilliseconds(remaining()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return milliseconds;
}
