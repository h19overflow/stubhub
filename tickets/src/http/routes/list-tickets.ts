import { Router } from "express";
import { HttpError } from "../error-handler.js";
import { listTicketsQuerySchema } from "../../tickets/schemas.js";
import { listAvailableTickets } from "../../tickets/ticket-repo.js";

const router = Router();

/**
 * GET /tickets — paginated search of available tickets with filters.
 *
 * Flow: validates query via listTicketsQuerySchema (q, place, startsAfter/
 * Before, min/maxPrice, page/pageSize) → 400 invalid_filters on fail →
 * listAvailableTickets (WHERE status=available + predicates, COUNT+SELECT
 * ordered by event_starts_at) → 200 TicketPage. Public, no auth.
 */
router.get("/tickets", (request, response) => {
  const parsed = listTicketsQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "Invalid ticket filters",
      "invalid_filters",
    );
  }

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
