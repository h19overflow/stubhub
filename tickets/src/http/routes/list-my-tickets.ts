import { requireAuth } from "@stubhub/common";
import { Router } from "express";
import { HttpError } from "../error-handler.js";
import { paginationSchema } from "../../tickets/schemas.js";
import { listOwnedTickets } from "../../tickets/ticket-repo.js";

const router = Router();

/**
 * GET /tickets/mine — authenticated paginated list of tickets owned by caller.
 *
 * Flow: requireAuth → validates pagination (page/pageSize) → 400 invalid_pagination
 * → listOwnedTickets(ownerId) ordered by created_at DESC → 200 TicketPage.
 * Seller dashboard; auth ensures owner isolation.
 */
router.get("/tickets/mine", requireAuth, (request, response) => {
  const parsed = paginationSchema.safeParse(request.query);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "invalid_pagination",
      "Invalid pagination",
    );
  }

  response.json(
    listOwnedTickets(
      response.locals.user.id,
      parsed.data.page,
      parsed.data.pageSize,
    ),
  );
});

export { router as listMyTickets };
