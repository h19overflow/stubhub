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
        "Invalid reservation",
        "invalid_reservation",
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
      throw new HttpError(404, "Ticket not found", "ticket_not_found");
    }
    if (result.outcome === "conflict") {
      throw new HttpError(
        409,
        "Reservation deadline conflicts",
        "reservation_conflict",
      );
    }
    throw new HttpError(409, "Ticket is unavailable", "ticket_unavailable");
  },
);

router.get(
  "/internal/tickets/:ticketId/reservation/:orderId",
  (request, response) => {
    const ticketId = ticketIdSchema.safeParse(request.params.ticketId);
    const orderId = orderIdSchema.safeParse(request.params.orderId);
    if (!ticketId.success || !orderId.success) {
      throw new HttpError(
        400,
        "Invalid reservation identity",
        "invalid_reservation_identity",
      );
    }

    const reservation = findReservation(ticketId.data, orderId.data);
    if (!reservation) {
      throw new HttpError(
        404,
        "Reservation not found",
        "reservation_not_found",
      );
    }
    response.json({ reservation });
  },
);

router.post(
  "/internal/tickets/:ticketId/reservation/:orderId/release",
  (request, response) => {
    const ticketId = ticketIdSchema.safeParse(request.params.ticketId);
    const orderId = orderIdSchema.safeParse(request.params.orderId);
    const hasBodyFields = Object.keys(request.body ?? {}).length !== 0;

    if (!ticketId.success || !orderId.success || hasBodyFields) {
      throw new HttpError(
        400,
        "Invalid reservation identity",
        "invalid_reservation_identity",
      );
    }

    response.json({
      outcome: releaseReservation(ticketId.data, orderId.data),
    });
  },
);

export { router as internalTicketReservations };
