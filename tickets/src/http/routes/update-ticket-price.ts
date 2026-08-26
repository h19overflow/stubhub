import { Router } from "express";
import { ticketIdSchema, updateTicketPriceSchema } from "../../tickets/schemas.js";
import { updateTicketPrice as updateTicketPriceRecord } from "../../tickets/ticket-repo.js";
import { HttpError } from "../error-handler.js";
import { requireAuth } from "../require-auth.js";

const router = Router();

router.patch("/tickets/:ticketId/price", requireAuth, (request, response) => {
  const ticketId = ticketIdSchema.safeParse(request.params.ticketId);
  if (!ticketId.success) {
    response.status(404).json({ error: "Ticket not found" });
    return;
  }

  const body = updateTicketPriceSchema.safeParse(request.body);
  if (!body.success) throw new HttpError(400, "Valid priceCents is required");

  const result = updateTicketPriceRecord(response.locals.user.id, ticketId.data, body.data.priceCents);
  if (result.outcome === "updated") {
    response.status(200).json({ ticket: result.ticket });
    return;
  }

  if (result.outcome === "not_found") {
    response.status(404).json({ error: "Ticket not found" });
    return;
  }

  response.status(409).json({ error: "Only available tickets can be edited" });
});

export { router as updateTicketPrice };
