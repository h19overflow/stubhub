import { requireAuth } from "@stubhub/common";
import express from "express";

const router = express.Router();

/**
 * GET /current-user — returns the authenticated user from the Bearer token.
 *
 * Flow: requireAuth (verifyAccessToken via @stubhub/common) → 401 if missing/
 * invalid; else 200 {user} from response.locals. Used by client to hydrate auth.
 */
router.get("/current-user", requireAuth, (_request, response) => {
  response.json({ user: response.locals.user });
});

export { router as currentUser };
