import { parseTicket, type Ticket, wrapped } from "../commerce-types";
import { apiRequest, jsonBody } from "../request";
import type { CreateTicketInput } from "./types";

const base = "/api/tickets";

export function createTicket(
  input: CreateTicketInput,
  idempotencyKey: string,
): Promise<Ticket> {
  const body = new FormData();
  body.set("eventName", input.eventName);
  body.set("description", input.description);
  body.set("eventStartsAt", input.eventStartsAt);
  if (input.eventEndsAt) body.set("eventEndsAt", input.eventEndsAt);
  body.set("ticketInfo", input.ticketInfo);
  body.set("place", input.place);
  body.set("priceCents", String(input.priceCents));
  body.set("image", input.image);

  return apiRequest(`${base}/tickets`, {
    body,
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
    parse: wrapped("ticket", parseTicket),
    protected: true,
  });
}

export function updateTicketPrice(
  ticketId: string,
  priceCents: number,
): Promise<Ticket> {
  return apiRequest(`${base}/tickets/${encodeURIComponent(ticketId)}/price`, {
    body: jsonBody({ priceCents }),
    method: "PATCH",
    parse: wrapped("ticket", parseTicket),
    protected: true,
  });
}
