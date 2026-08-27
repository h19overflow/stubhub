/**
 * Order lifecycle owned by this service.
 *
 * `pending -> payment_processing -> complete`
 * `pending -> expired`
 * `payment_processing -> pending | expired` after a failed payment
 */
type OrderStatus = "pending" | "payment_processing" | "complete" | "expired";

/**
 * Public Order shape.
 *
 * `amountCents` and `currency` are captured when purchase begins; later Ticket
 * price edits must not change this snapshot.
 */
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

/** SQLite shape, including idempotency metadata that is not exposed on `Order`. */
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

/**
 * Order creation data plus the key and fingerprint used to make retries safe.
 * Reusing a key is valid only when the fingerprint still describes the same request.
 */
type CreateOrderInput = {
  id: string;
  userId: string;
  ticketId: string;
  amountCents: number;
  expiresAt: string;
  idempotencyKey: string;
  requestFingerprint: string;
};

/**
 * `replayed` returns the original Order for the same request.
 * `conflict` means the idempotency key was reused for different request data.
 */
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
