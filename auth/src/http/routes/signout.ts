import express from "express";
import {
  clearRefreshTokenCookie,
  readRefreshToken,
} from "../../tokens/refresh-token-cookie.js";
import { revokeRefreshToken } from "../../tokens/refresh-token-repo.js";

const router = express.Router();

/**
 * POST /signout — revokes the refresh family and clears the cookie.
 *
 * Flow: readRefreshToken → revokeRefreshToken (revokeFamily) → always clear
 * cookie → 204. Idempotent; no error if missing.
 */
router.post("/signout", (request, response) => {
  const refreshToken = readRefreshToken(request.headers.cookie);
  if (refreshToken) revokeRefreshToken(refreshToken);
  response.setHeader("Set-Cookie", clearRefreshTokenCookie());
  response.status(204).send();
});

export { router as signout };
