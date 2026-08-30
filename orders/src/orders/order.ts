type OrderStatus = "pending" | "payment_processing" | "complete" | "expired";

type OrderRow = {
  id: string;
  user_id: string;
  ticket_id: string;
  amount_cents: number;
  currency: "USD";
  status: OrderStatus;
  expires_at: number;
  version: number;
  seller_user_id: string | null;
  ticket_event_name: string;
  ticket_description: string | null;
  ticket_event_starts_at: number;
  ticket_event_ends_at: number | null;
  ticket_place: string;
  ticket_info: string;
  created_at: number;
  updated_at: number;
};

type Order = {
  id: string;
  ticketId: string;
  sellerUserId: string | null;
  amountCents: number;
  currency: "USD";
  status: OrderStatus;
  expiresAt: string;
  version: number;
  ticket: {
    eventName: string;
    description: string | null;
    eventStartsAt: string;
    eventEndsAt: string | null;
    place: string;
    ticketInfo: string;
  };
  createdAt: string;
  updatedAt: string;
};

/**
 * Projects an OrderRow to the public Order JSON (ISO dates, nested ticket snapshot).
 *
 * Flow: purchase-workflow and order queries map rows via this. Converts
 * expires_at/created_at/updated_at and ticket event timestamps to ISO. Keeps
 * amount_cents/currency/status/version intact. Snapshot fields come from the
 * Tickets reservation at create time (immutable).
 */
function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    sellerUserId: row.seller_user_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    expiresAt: new Date(row.expires_at).toISOString(),
    version: row.version,
    ticket: {
      eventName: row.ticket_event_name,
      description: row.ticket_description,
      eventStartsAt: new Date(row.ticket_event_starts_at).toISOString(),
      eventEndsAt:
        row.ticket_event_ends_at === null
          ? null
          : new Date(row.ticket_event_ends_at).toISOString(),
      place: row.ticket_place,
      ticketInfo: row.ticket_info,
    },
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export { toOrder };
export type { Order, OrderRow, OrderStatus };
