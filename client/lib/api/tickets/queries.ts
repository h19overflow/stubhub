import {
  parseTicket,
  parseTicketPage,
  type Ticket,
  type TicketPage,
  wrapped,
} from "../commerce-types";
import { apiRequest } from "../request";
import type { TicketFilters } from "./types";

const base = "/api/tickets";

function queryString(filters: TicketFilters) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const value = query.toString();
  return value ? `?${value}` : "";
}

export function listTickets(filters: TicketFilters): Promise<TicketPage> {
  return apiRequest(`${base}/tickets${queryString(filters)}`, {
    parse: parseTicketPage,
  });
}

export function getTicket(ticketId: string): Promise<Ticket> {
  return apiRequest(`${base}/tickets/${encodeURIComponent(ticketId)}`, {
    parse: wrapped("ticket", parseTicket),
  });
}

export function listMyTickets(page = 1): Promise<TicketPage> {
  return apiRequest(`${base}/tickets/mine?page=${page}`, {
    parse: parseTicketPage,
    protected: true,
  });
}
