import { useCallback, useEffect, useState } from "react";
import type { TicketPage } from "../../lib/api/commerce-types";
import { listTickets } from "../../lib/api/tickets/queries";
import type { TicketFilters } from "../../lib/api/tickets/types";
import { ticketErrorMessage, type LoadState } from "./ticket-hook-state";

export function useTickets(filters: TicketFilters, enabled = true) {
  const [state, setState] = useState<LoadState<TicketPage>>({
    status: "loading",
  });

  // Serialized filters give the effect a stable request identity.
  const filterKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    if (!enabled) return;
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await listTickets(filters) });
    } catch (error) {
      setState({ status: "error", message: ticketErrorMessage(error) });
    }
  }, [enabled, filterKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
