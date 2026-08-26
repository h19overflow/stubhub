import { Router } from "express";
import { HttpError } from "../error-handler.js";
import { requireAuth } from "../require-auth.js";
import { listTicketsQuerySchema } from "../../tickets/schemas.js";
import { listAvailableTickets } from "../../tickets/ticket-repo.js";

const router = Router();

router.get("/tickets", requireAuth, (request, response) => {
  const parsed = listTicketsQuerySchema.safeParse(request.query);
  if (!parsed.success) throw new HttpError(400, "Invalid ticket filters");

  const { startsAfter, startsBefore, ...filters } = parsed.data;
  response.json(
    listAvailableTickets({
      ...filters,
      startsAfter: startsAfter ? Date.parse(startsAfter) : undefined,
      startsBefore: startsBefore ? Date.parse(startsBefore) : undefined,
    }),
  );
});

export { router as listTickets };
