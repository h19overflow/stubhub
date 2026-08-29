import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTicket,
  getTicket,
  listMyTickets,
  listTickets,
  updateTicketPrice,
  type CreateTicketInput,
  type TicketFilters,
} from "../../lib/api/tickets/client";
import type { Ticket, TicketPage } from "../../lib/api/commerce-types";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The service is temporarily unavailable";
}

export function useTickets(filters: TicketFilters, enabled = true) {
  const [state, setState] = useState<LoadState<TicketPage>>({ status: "loading" });

  // Serialized filters give the effect a stable request identity.
  const filterKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    if (!enabled) return;
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await listTickets(filters) });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }, [enabled, filterKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}

export function useTicket(ticketId: string | undefined) {
  const [state, setState] = useState<LoadState<Ticket>>({ status: "loading" });

  const load = useCallback(async () => {
    if (!ticketId) return;
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await getTicket(ticketId) });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}

export function useMyTickets(page: number) {
  const [state, setState] = useState<LoadState<TicketPage>>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await listMyTickets(page) });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
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

export function useCreateTicket() {
  // One mounted create flow keeps one idempotency key across retries.
  const key = useRef(crypto.randomUUID());
  const [state, setState] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(input: CreateTicketInput) {
    setState("submitting");
    setError("");
    try {
      return await createTicket(input, key.current);
    } catch (cause) {
      setState("error");
      setError(errorMessage(cause));
      // Preserve the original API failure for callers.
      throw cause;
    }
  }

  return { error, state, submit };
}
