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
  ticket_event_name: string;
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
  amountCents: number;
  currency: "USD";
  status: OrderStatus;
  expiresAt: string;
  version: number;
  ticket: {
    eventName: string;
    eventStartsAt: string;
    eventEndsAt: string | null;
    place: string;
    ticketInfo: string;
  };
  createdAt: string;
  updatedAt: string;
};

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    expiresAt: new Date(row.expires_at).toISOString(),
    version: row.version,
    ticket: {
      eventName: row.ticket_event_name,
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
