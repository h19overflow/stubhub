import express from "express";
import { refreshAuthentication } from "../../tokens/authentication.js";
import {
  clearRefreshTokenCookie,
  readRefreshToken,
  refreshTokenCookie,
} from "../../tokens/refresh-token-cookie.js";

const router = express.Router();

/**
 * POST /refresh — rotates the refresh token and returns a new access token.
 *
 * Flow: readRefreshToken from Cookie → refreshAuthentication (BEGIN IMMEDIATE
 * rotation, single-use, replay revokes family) → on miss clear cookie 401;
 * on success Set-Cookie new refreshToken + 200 {user,accessToken}. No auth
 * header needed; relies on HttpOnly cookie rotation.
 */
router.post("/refresh", async (request, response) => {
  const rawRefreshToken = readRefreshToken(request.headers.cookie);
  const refreshed = rawRefreshToken
    ? await refreshAuthentication(rawRefreshToken)
    : null;

  if (!refreshed) {
    response.setHeader("Set-Cookie", clearRefreshTokenCookie());
    response.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }

  response.setHeader("Set-Cookie", refreshTokenCookie(refreshed.refreshToken));
  response.json(refreshed.body);
});

export { router as refresh };
