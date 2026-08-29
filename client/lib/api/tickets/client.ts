import { apiRequest, jsonBody } from "../request";
import { parseTicket, parseTicketPage, type Ticket, type TicketPage, wrapped } from "../commerce-types";

const base = "/api/tickets";

export type TicketFilters = {
  q?: string;
  place?: string;
  startsAfter?: string;
  startsBefore?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  page?: number;
  pageSize?: number;
};

export type CreateTicketInput = {
  eventName: string;
  description: string;
  eventStartsAt: string;
  eventEndsAt?: string;
  ticketInfo: string;
  place: string;
  priceCents: number;
  image: File;
};

function queryString(filters: TicketFilters) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const value = query.toString();
  return value ? `?${value}` : "";
}

export function listTickets(filters: TicketFilters): Promise<TicketPage> {
  return apiRequest(`${base}/tickets${queryString(filters)}`, { parse: parseTicketPage });
}

export function getTicket(ticketId: string): Promise<Ticket> {
  return apiRequest(`${base}/tickets/${encodeURIComponent(ticketId)}`, { parse: wrapped("ticket", parseTicket) });
}

export function listMyTickets(page = 1): Promise<TicketPage> {
  return apiRequest(`${base}/tickets/mine?page=${page}`, { parse: parseTicketPage, protected: true });
}

export function createTicket(input: CreateTicketInput, idempotencyKey: string): Promise<Ticket> {
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

export function updateTicketPrice(ticketId: string, priceCents: number): Promise<Ticket> {
  return apiRequest(`${base}/tickets/${encodeURIComponent(ticketId)}/price`, {
    body: jsonBody({ priceCents }),
    method: "PATCH",
    parse: wrapped("ticket", parseTicket),
    protected: true,
  });
}
