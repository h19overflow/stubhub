import { requireAuth } from "@stubhub/common";
import { Router } from "express";
import {
  ticketIdSchema,
  updateTicketPriceSchema,
} from "../../tickets/schemas.js";
import {
  updateTicketPrice as updateTicketPriceRecord,
} from "../../tickets/ticket-repo.js";
import { HttpError } from "../error-handler.js";

const router = Router();

/**
 * PATCH /tickets/:ticketId/price — owner-only price update on available tickets.
 *
 * Flow: requireAuth → validates ticketId UUID + body {priceCents} →
 * updateTicketPriceRecord (guarded UPDATE where status=available) →
 * updated→200 {ticket}, not_found→404, otherwise 409 ticket_unavailable
 * (reserved/sold cannot be edited). Prevents price mutation mid-reservation.
 */
router.patch("/tickets/:ticketId/price", requireAuth, (request, response) => {
  const ticketId = ticketIdSchema.safeParse(request.params.ticketId);
  if (!ticketId.success) {
    response.status(404).json({
      error: "Ticket not found",
      code: "ticket_not_found",
    });
    return;
  }

  const body = updateTicketPriceSchema.safeParse(request.body);
  if (!body.success) {
    throw new HttpError(
      400,
      "Valid priceCents is required",
      "invalid_price",
    );
  }

  const result = updateTicketPriceRecord(
    response.locals.user.id,
    ticketId.data,
    body.data.priceCents,
  );
  if (result.outcome === "updated") {
    response.status(200).json({
      ticket: result.ticket,
    });
    return;
  }

  if (result.outcome === "not_found") {
    response.status(404).json({
      error: "Ticket not found",
      code: "ticket_not_found",
    });
    return;
  }

  response.status(409).json({
    error: "Only available tickets can be edited",
    code: "ticket_unavailable",
  });
});

export { router as updateTicketPrice };
