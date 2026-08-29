import { useCallback, useEffect, useState } from "react";
import type { Order } from "../../lib/api/commerce-types";
import { getOrder } from "../../lib/api/orders/queries";
import { orderErrorMessage, type LoadState } from "./order-hook-state";

export function useOrder(orderId: string | undefined) {
  const [state, setState] = useState<LoadState<Order>>({ status: "loading" });

  const load = useCallback(
    async (showLoading = true) => {
      if (!orderId) return;
      if (showLoading) setState({ status: "loading" });
      try {
        setState({ status: "ready", data: await getOrder(orderId) });
      } catch (error) {
        setState({ status: "error", message: orderErrorMessage(error) });
      }
    },
    [orderId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while the server reports payment processing.
  useEffect(() => {
    if (
      state.status !== "ready" ||
      state.data.status !== "payment_processing"
    ) {
      return;
    }
    const timer = window.setTimeout(() => void load(false), 2000);
    return () => window.clearTimeout(timer);
  }, [load, state]);

  function setOrder(order: Order) {
    setState({ status: "ready", data: order });
  }

  return { state, reload: load, setOrder };
}
