import { useRef, useState } from "react";
import { createTicket } from "../../lib/api/tickets/commands";
import type { CreateTicketInput } from "../../lib/api/tickets/types";
import { ticketErrorMessage } from "./ticket-hook-state";

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
      setError(ticketErrorMessage(cause));
      // Preserve the original API failure for callers.
      throw cause;
    }
  }

  return { error, state, submit };
}
