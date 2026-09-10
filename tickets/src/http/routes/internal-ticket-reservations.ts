import { Router } from "express";
import { requireInternalAuth } from "../require-internal-auth.js";
import {
  orderIdSchema,
  reservationCommandSchema,
  ticketIdSchema,
} from "../../tickets/schemas.js";
import {
  findReservation,
  releaseReservation,
  reserveTicket,
} from "../../tickets/ticket-repo.js";
import { HttpError } from "../error-handler.js";

const router = Router();
router.use("/internal", requireInternalAuth);

/**
 * PUT /internal/tickets/:ticketId/reservation — authoritative reservation (Orders→Tickets).
 *
 * Flow: requireInternalAuth (INTERNAL_SERVICE_TOKEN timing-safe) → validates
 * ticketId + {orderId, expiresAt} (future ISO) → reserveTicket (BEGIN IMMEDIATE
 * guarded: not_found→404, conflict→409 reservation_conflict on deadline mismatch,
 * unavailable→409) → reserved 201 / replayed 200 {reservation}. Single writer
 * for Ticket status; outbox not involved here (sync RPC).
 */
router.put(
  "/internal/tickets/:ticketId/reservation",
  (request, response) => {
    const ticketId = ticketIdSchema.safeParse(request.params.ticketId);
    const command = reservationCommandSchema.safeParse(request.body);
    const invalidDeadline =
      command.success && Date.parse(command.data.expiresAt) <= Date.now();

    if (!ticketId.success || !command.success || invalidDeadline) {
      throw new HttpError(
        400,
        "invalid_reservation",
        "Invalid reservation",
      );
    }

    const result = reserveTicket(
      ticketId.data,
      command.data.orderId,
      Date.parse(command.data.expiresAt),
    );
    if (result.outcome === "reserved" || result.outcome === "replayed") {
      response
        .status(result.outcome === "reserved" ? 201 : 200)
        .json(result);
      return;
    }
    if (result.outcome === "not_found") {
      throw new HttpError(404, "ticket_not_found", "Ticket not found");
    }
    if (result.outcome === "conflict") {
      throw new HttpError(
        409,
        "reservation_conflict",
        "Reservation deadline conflicts",
      );
    }
    throw new HttpError(409, "ticket_unavailable", "Ticket is unavailable");
  },
);

/**
 * GET /internal/tickets/:ticketId/reservation/:orderId — verifies a reservation is held.
 *
 * Flow: internal auth → validates ticketId+orderId UUIDs → findReservation →
 * 404 reservation_not_found if not reserved by that order; else 200 {reservation}.
 * Used by Orders payment workflow to ensure ticket still locked before beginPayment.
 */
router.get(
  "/internal/tickets/:ticketId/reservation/:orderId",
  (request, response) => {
    const ticketId = ticketIdSchema.safeParse(request.params.ticketId);
    const orderId = orderIdSchema.safeParse(request.params.orderId);
    if (!ticketId.success || !orderId.success) {
      throw new HttpError(
        400,
        "invalid_reservation_identity",
        "Invalid reservation identity",
      );
    }

    const reservation = findReservation(ticketId.data, orderId.data);
    if (!reservation) {
      throw new HttpError(
        404,
        "reservation_not_found",
        "Reservation not found",
      );
    }
    response.json({ reservation });
  },
);

/**
 * POST /internal/.../release — releases a lock only if held by that order (expiration).
 *
 * Flow: internal auth → validates IDs, requires empty body → releaseReservation
 * (BEGIN IMMEDIATE, guards locked_by_order_id, handles already_available/sold/
 * not_matching/missing via outcome) → 200 {outcome}. Idempotent; stale release
 * checks lockedByOrderId so it never unlocks a newer reservation.
 */
router.post(
  "/internal/tickets/:ticketId/reservation/:orderId/release",
  (request, response) => {
    const ticketId = ticketIdSchema.safeParse(request.params.ticketId);
    const orderId = orderIdSchema.safeParse(request.params.orderId);
    const hasBodyFields = Object.keys(request.body ?? {}).length !== 0;

    if (!ticketId.success || !orderId.success || hasBodyFields) {
      throw new HttpError(
        400,
        "invalid_reservation_identity",
        "Invalid reservation identity",
      );
    }

    response.json({
      outcome: releaseReservation(ticketId.data, orderId.data),
    });
  },
);

export { router as internalTicketReservations };
