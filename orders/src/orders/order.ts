type OrderStatus = "pending" | "payment_processing" | "complete" | "expired";

type Order = {
  id: string;
  userId: string;
  ticketId: string;
  amountCents: number;
  currency: "USD";
  status: OrderStatus;
  expiresAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type OrderRow = {
  id: string;
  user_id: string;
  ticket_id: string;
  amount_cents: number;
  currency: "USD";
  status: OrderStatus;
  expires_at: number;
  version: number;
  idempotency_key: string;
  request_fingerprint: string;
  created_at: number;
  updated_at: number;
};

type CreateOrderInput = {
  id: string;
  userId: string;
  ticketId: string;
  amountCents: number;
  expiresAt: string;
  idempotencyKey: string;
  requestFingerprint: string;
};

type CreateOrderResult =
  | { outcome: "created"; order: Order }
  | { outcome: "replayed"; order: Order }
  | { outcome: "conflict" };

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    ticketId: row.ticket_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    expiresAt: new Date(row.expires_at).toISOString(),
    version: row.version,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export { toOrder };
export type { CreateOrderInput, CreateOrderResult, Order, OrderRow, OrderStatus };
