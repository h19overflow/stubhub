import { Router } from "express";
import { requireAuth } from "../require-auth.js";
import { ticketIdSchema } from "../../tickets/schemas.js";
import { findTicketById } from "../../tickets/ticket-repo.js";

const router = Router();

router.get("/tickets/:ticketId", requireAuth, (request, response) => {
  const parsed = ticketIdSchema.safeParse(request.params.ticketId);
  if (!parsed.success) {
    response.status(404).json({ error: "Ticket not found" });
    return;
  }

  const ticket = findTicketById(parsed.data);
  if (!ticket) {
    response.status(404).json({ error: "Ticket not found" });
    return;
  }

  response.json({ ticket });
});

export { router as getTicket };
