import { useCallback, useEffect, useState } from "react";
import type { Order } from "../../lib/api/commerce-types";
import { listMyOrders } from "../../lib/api/orders/queries";
import { orderErrorMessage, type LoadState } from "./order-hook-state";

// The server derives the owner from authentication; no user ID is sent.
export function useOrders() {
  const [state, setState] = useState<LoadState<Order[]>>({
    status: "loading",
  });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await listMyOrders() });
    } catch (error) {
      setState({ status: "error", message: orderErrorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
