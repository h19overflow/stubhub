import { useEffect, useRef, useState } from "react";
import { startOrder } from "../../lib/api/orders/commands";
import type { Order } from "../../lib/api/commerce-types";
import { ApiError } from "../../lib/api/request";
import { orderErrorMessage } from "./order-hook-state";

type StartOrderAction =
  | { outcome: "order"; order: Order }
  | { outcome: "rejected" | "unresolved" | "aborted" };

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
        const result = await startOrder(
          ticketId,
          attempt.key,
          controller.signal,
        );
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
        setError(
          "Purchase is still processing. Retry to continue with the same request key.",
        );
      }
      return { outcome: "unresolved" };
    } catch (cause) {
      if (!isActive(controller)) return { outcome: "aborted" };
      // A 4xx rejection clears the key; temporary failures keep it.
      const rejected =
        cause instanceof ApiError && cause.status >= 400 && cause.status < 500;
      if (rejected) logicalAttempt.current = null;
      setStatus(rejected ? "rejected" : "temporary_failure");
      setError(orderErrorMessage(cause));
      return { outcome: rejected ? "rejected" : "unresolved" };
    }
  }

  return { error, start, status };
}
