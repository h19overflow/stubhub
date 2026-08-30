import { AppError } from "./http/app-error.js";
import type { Snapshot } from "./orders/order-repo.js";

type Reservation = {
  ticketId: string;
  orderId: string;
  expiresAt: string;
  priceCents: number;
  currency: "USD";
  ticket: Snapshot;
};

type TicketsResponse = {
  reservation?: Reservation;
  error?: string;
  code?: string;
};

const baseUrl = process.env.TICKETS_SERVICE_URL ?? "http://tickets:3002";
const token = process.env.INTERNAL_SERVICE_TOKEN;

/**
 * Authenticated fetch to the Tickets internal API.
 *
 * Flow: reserve/verify/release all go through this. Attaches INTERNAL_SERVICE_TOKEN
 * as Bearer, sets JSON content-type, 5s abort timeout. Throws AppError 503 if
 * fetch fails or Tickets is unreachable, so purchase/payment workflows can
 * persist a retry (schedulePurchase) instead of failing the order.
 */
async function call(path: string, init?: RequestInit): Promise<Response> {
  if (!token) throw new Error("INTERNAL_SERVICE_TOKEN is required");

  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new AppError(
      503,
      "dependency_unavailable",
      "Tickets service is unavailable",
    );
  }
}

/**
 * Reserves a ticket in the Tickets service for an Order (authoritative availability check).
 *
 * Flow: purchase-workflow processPurchase() -> calls this with ticketId, orderId,
 * expiresAt (ISO). PUT /internal/tickets/:id/reservation. Maps 404 -> ticket_not_found,
 * 409+reservation_conflict -> reservation_conflict, 409 otherwise -> ticket_unavailable,
 * other non-2xx -> dependency_unavailable. Returns Reservation (snapshot + price)
 * on success for completePurchase to persist.
 */
async function reserve(
  ticketId: string,
  orderId: string,
  expiresAt: number,
): Promise<Reservation> {
  const response = await call(
    `/internal/tickets/${encodeURIComponent(ticketId)}/reservation`,
    {
      method: "PUT",
      body: JSON.stringify({
        orderId,
        expiresAt: new Date(expiresAt).toISOString(),
      }),
    },
  );
  const body = (await response.json().catch(() => null)) as TicketsResponse | null;
  if (response.ok && body?.reservation) return body.reservation;
  if (response.status === 404) {
    throw new AppError(404, "ticket_not_found", "Ticket not found");
  }
  if (response.status === 409 && body?.code === "reservation_conflict") {
    throw new AppError(
      409,
      "reservation_conflict",
      "Reservation deadline conflicts",
    );
  }
  if (response.status === 409) {
    throw new AppError(409, "ticket_unavailable", "Ticket unavailable");
  }
  throw new AppError(
    503,
    "dependency_unavailable",
    "Tickets service is unavailable",
  );
}

/**
 * Verifies that a ticket is still reserved for the given Order (payment gate).
 *
 * Flow: payment-workflow submitOrderPayment() calls this before beginPayment to
 * ensure the reservation hasn't expired/been stolen. GET
 * /internal/tickets/:ticketId/reservation/:orderId. 404 -> reservation_mismatch
 * (treated as order_not_payable), else 503. Returns Reservation on success.
 */
async function verify(
  ticketId: string,
  orderId: string,
): Promise<Reservation> {
  const response = await call(
    `/internal/tickets/${encodeURIComponent(ticketId)}/reservation/${encodeURIComponent(orderId)}`,
  );
  const body = (await response.json().catch(() => null)) as TicketsResponse | null;
  if (response.ok && body?.reservation) return body.reservation;
  if (response.status === 404) {
    throw new AppError(
      409,
      "reservation_mismatch",
      "Reservation does not match",
    );
  }
  throw new AppError(
    503,
    "dependency_unavailable",
    "Tickets service is unavailable",
  );
}

/**
 * Releases a ticket reservation for an Order (rollback/expire path).
 *
 * Flow: processRelease() calls this when purchase expires or is abandoned.
 * POST .../release. Any non-2xx throws 503 so schedulePurchase can retry the
 * releasing state. Idempotent on Tickets side via lockedByOrderId guard.
 */
async function release(ticketId: string, orderId: string): Promise<void> {
  const response = await call(
    `/internal/tickets/${encodeURIComponent(ticketId)}/reservation/${encodeURIComponent(orderId)}/release`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new AppError(
      503,
      "dependency_unavailable",
      "Tickets service is unavailable",
    );
  }
}

export { release, reserve, verify };
