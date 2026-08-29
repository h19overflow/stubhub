import { useCallback, useEffect, useState } from "react";
import type { Ticket } from "../../lib/api/commerce-types";
import { getTicket } from "../../lib/api/tickets/queries";
import { ticketErrorMessage, type LoadState } from "./ticket-hook-state";

export function useTicket(ticketId: string | undefined) {
  const [state, setState] = useState<LoadState<Ticket>>({ status: "loading" });

  const load = useCallback(async () => {
    if (!ticketId) return;
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await getTicket(ticketId) });
    } catch (error) {
      setState({ status: "error", message: ticketErrorMessage(error) });
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
