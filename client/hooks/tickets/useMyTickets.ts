import { useCallback, useEffect, useState } from "react";
import type { TicketPage } from "../../lib/api/commerce-types";
import { updateTicketPrice } from "../../lib/api/tickets/commands";
import { listMyTickets } from "../../lib/api/tickets/queries";
import { ticketErrorMessage, type LoadState } from "./ticket-hook-state";

export function useMyTickets(page: number) {
  const [state, setState] = useState<LoadState<TicketPage>>({
    status: "loading",
  });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await listMyTickets(page) });
    } catch (error) {
      setState({ status: "error", message: ticketErrorMessage(error) });
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changePrice(ticketId: string, priceCents: number) {
    // Use the authoritative ticket returned by the server.
    const ticket = await updateTicketPrice(ticketId, priceCents);

    // The functional update avoids overwriting newer state after the request.
    setState((current) => {
      if (current.status !== "ready") return current;
      return {
        ...current,
        data: {
          ...current.data,
          tickets: current.data.tickets.map((item) =>
            item.id === ticket.id ? ticket : item,
          ),
        },
      };
    });
  }

  return { state, reload: load, changePrice };
}
