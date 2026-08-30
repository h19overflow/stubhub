import { Router } from "express";
import { ticketIdSchema } from "../../tickets/schemas.js";
import { findTicketById } from "../../tickets/ticket-repo.js";

const router = Router();

/**
 * GET /tickets/:ticketId — public read of a single ticket (any status).
 *
 * Flow: validates ticketId UUID → findTicketById → 404 ticket_not_found if
 * invalid or missing; else 200 {ticket}. No auth; used by discovery/detail.
 */
router.get("/tickets/:ticketId", (request, response) => {
  const parsed = ticketIdSchema.safeParse(request.params.ticketId);
  if (!parsed.success) {
    response.status(404).json({
      error: "Ticket not found",
      code: "ticket_not_found",
    });
    return;
  }

  const ticket = findTicketById(parsed.data);
  if (!ticket) {
    response.status(404).json({
      error: "Ticket not found",
      code: "ticket_not_found",
    });
    return;
  }

  response.json({ ticket });
});

export { router as getTicket };
