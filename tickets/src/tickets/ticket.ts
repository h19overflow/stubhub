type TicketStatus = "available" | "reserved" | "sold";

type Ticket = {
  id: string;
  ownerId: string;
  eventName: string;
  description: string;
  eventStartsAt: string;
  eventEndsAt: string | null;
  ticketInfo: string;
  place: string;
  priceCents: number;
  currency: "USD";
  imageUrl: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
};

type TicketPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type TicketPage = { tickets: Ticket[]; pagination: TicketPagination };

type TicketRow = {
  id: string;
  owner_id: string;
  event_name: string;
  description: string;
  event_starts_at: number;
  event_ends_at: number | null;
  ticket_info: string;
  place: string;
  price_cents: number;
  currency: "USD";
  image_filename: string;
  status: TicketStatus;
  locked_by_order_id: string | null;
  lock_expires_at: number | null;
  idempotency_key: string;
  request_fingerprint: string;
  created_at: number;
  updated_at: number;
};

type TicketFilters = {
  q?: string;
  place?: string;
  startsAfter?: number;
  startsBefore?: number;
  minPriceCents?: number;
  maxPriceCents?: number;
  page: number;
  pageSize: number;
};

type CreateTicketInput = {
  id: string;
  ownerId: string;
  eventName: string;
  description: string;
  eventStartsAt: number;
  eventEndsAt: number | null;
  ticketInfo: string;
  place: string;
  priceCents: number;
  imageFilename: string;
  idempotencyKey: string;
  requestFingerprint: string;
};

type CreateTicketResult =
  | { outcome: "created"; ticket: Ticket }
  | { outcome: "replayed"; ticket: Ticket }
  | { outcome: "conflict" };

type UpdateTicketPriceResult =
  | { outcome: "updated"; ticket: Ticket }
  | { outcome: "not_found" }
  | { outcome: "unavailable" };

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    ownerId: row.owner_id,
    eventName: row.event_name,
    description: row.description,
    eventStartsAt: new Date(row.event_starts_at).toISOString(),
    eventEndsAt: row.event_ends_at === null ? null : new Date(row.event_ends_at).toISOString(),
    ticketInfo: row.ticket_info,
    place: row.place,
    priceCents: row.price_cents,
    currency: row.currency,
    imageUrl: `/ticket-images/${row.image_filename}`,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export { toTicket };
export type {
  CreateTicketInput,
  CreateTicketResult,
  Ticket,
  TicketFilters,
  TicketPage,
  TicketPagination,
  TicketRow,
  TicketStatus,
  UpdateTicketPriceResult,
};
