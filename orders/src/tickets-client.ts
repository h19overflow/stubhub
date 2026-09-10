import { AppError } from "./http/app-error.js";
import type { Snapshot } from "./orders/order-repo.js";

type Reservation = {
  ticketId: string;
  orderId: string;
  sellerUserId: string;
  expiresAt: string;
  priceCents: number;
  currency: "USD";
  ticket: Snapshot;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteIso(value: unknown): value is string {
  return (
    typeof value === "string" &&
    isoTimestamp.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function parseReservation(
  body: unknown,
  ticketId: string,
  orderId: string,
  expectedExpiresAt?: string,
): Reservation | null {
  if (!isRecord(body) || !isRecord(body.reservation)) return null;
  const value = body.reservation;
  if (
    typeof value.ticketId !== "string" ||
    value.ticketId !== ticketId ||
    typeof value.orderId !== "string" ||
    value.orderId !== orderId ||
    !isFiniteIso(value.expiresAt) ||
    (expectedExpiresAt !== undefined && value.expiresAt !== expectedExpiresAt) ||
    typeof value.sellerUserId !== "string" ||
    !uuid.test(value.sellerUserId) ||
    typeof value.priceCents !== "number" ||
    !Number.isSafeInteger(value.priceCents) ||
    value.priceCents <= 0 ||
    value.currency !== "USD" ||
    !isRecord(value.ticket)
  ) {
    return null;
  }

  const ticket = value.ticket;
  const eventEndsAt = ticket.eventEndsAt;
  if (
    !isNonEmptyString(ticket.eventName) ||
    !isNonEmptyString(ticket.description) ||
    !isNonEmptyString(ticket.place) ||
    !isNonEmptyString(ticket.ticketInfo) ||
    !isFiniteIso(ticket.eventStartsAt) ||
    (eventEndsAt !== null && !isFiniteIso(eventEndsAt))
  ) {
    return null;
  }

  return {
    ticketId: value.ticketId,
    orderId: value.orderId,
    sellerUserId: value.sellerUserId,
    expiresAt: value.expiresAt,
    priceCents: value.priceCents,
    currency: "USD",
    ticket: {
      eventName: ticket.eventName,
      description: ticket.description,
      eventStartsAt: ticket.eventStartsAt,
      eventEndsAt,
      place: ticket.place,
      ticketInfo: ticket.ticketInfo,
    },
  };
}

function getBaseUrl(): string {
  return process.env.TICKETS_SERVICE_URL ?? "http://tickets:3002";
}

function getToken(): string {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) throw new Error("INTERNAL_SERVICE_TOKEN is required");
  return token;
}
/**
 * Authenticated fetch to the Tickets internal API.
 *
 * Flow: reserve/verify/release all go through this. Attaches INTERNAL_SERVICE_TOKEN
 * as Bearer, sets JSON content-type, 5s abort timeout. Throws AppError 503 if
 * fetch fails or Tickets is unreachable, so purchase/payment workflows can
 * persist a retry (schedulePurchase) instead of failing the order.
 */
async function call(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const baseUrl = getBaseUrl();
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
  const expectedExpiresAt = new Date(expiresAt).toISOString();
  const response = await call(
    `/internal/tickets/${encodeURIComponent(ticketId)}/reservation`,
    {
      method: "PUT",
      body: JSON.stringify({
        orderId,
        expiresAt: expectedExpiresAt,
      }),
    },
  );
  const body = await response.json().catch(() => null);
  const reservation = response.ok
    ? parseReservation(body, ticketId, orderId, expectedExpiresAt)
    : null;
  if (reservation) return reservation;
  if (response.status === 404) {
    throw new AppError(404, "ticket_not_found", "Ticket not found");
  }
  if (response.status === 409 && isRecord(body) && body.code === "reservation_conflict") {
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
  const body = await response.json().catch(() => null);
  const reservation = response.ok
    ? parseReservation(body, ticketId, orderId)
    : null;
  if (reservation) return reservation;
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
