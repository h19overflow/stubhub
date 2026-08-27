import { requireAuth } from "@stubhub/common";
import { Router } from "express";
import { HttpError } from "../error-handler.js";
import { paginationSchema } from "../../tickets/schemas.js";
import { listOwnedTickets } from "../../tickets/ticket-repo.js";

const router = Router();

router.get("/tickets/mine", requireAuth, (request, response) => {
  const parsed = paginationSchema.safeParse(request.query);
  if (!parsed.success) throw new HttpError(400, "Invalid pagination");

  response.json(listOwnedTickets(response.locals.user.id, parsed.data.page, parsed.data.pageSize));
});

export { router as listMyTickets };
