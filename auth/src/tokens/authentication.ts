import { ACCESS_TOKEN_TTL_SECONDS } from "@stubhub/common";
import { createAccessToken } from "./access-token.js";
import {
  createRefreshToken,
  rotateRefreshToken,
} from "./refresh-token-repo.js";
import type { PublicUser } from "../users/user.js";

type AuthenticationBody = {
  user: PublicUser;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
};
type Authentication = {
  body: AuthenticationBody;
  refreshToken: string;
};
/**
 * Builds the JSON body returned after auth (user + Bearer token).
 *
 * Flow: helper for createAuthentication and refreshAuthentication. Calls
 * createAccessToken and pairs it with ACCESS_TOKEN_TTL_SECONDS so the client
 * knows when to refresh. Does not touch refresh tokens.
 */
async function authenticationBody(user: PublicUser): Promise<AuthenticationBody> {
  return {
    user,
    accessToken: await createAccessToken(user),
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/**
 * Creates a fresh auth session after signup/signin verification.
 *
 * Flow: verify-email or signin/code -> consumeChallenge succeeds -> calls
 * this with PublicUser. Generates access token via authenticationBody plus a
 * new opaque refresh token (createRefreshToken) stored hashed in SQLite.
 * Refresh token is kept out of the JSON body and set as HttpOnly cookie by
 * the route. Returns {body, refreshToken}.
 */
async function createAuthentication(user: PublicUser): Promise<Authentication> {
  return {
    body: await authenticationBody(user),
    // Kept outside the response body so callers cannot accidentally expose it as JSON.
    refreshToken: createRefreshToken(user.id),
  };
}

/**
 * Rotates an existing refresh token and issues a new access token.
 *
 * Flow: POST /refresh -> reads cookie -> calls this. Delegates to
 * rotateRefreshToken (single-use rotation + replay detection). If rotation
 * fails (expired/revoked/replayed) returns null -> route returns 401.
 * Otherwise builds new authenticationBody for the same user.
 */
async function refreshAuthentication(rawRefreshToken: string): Promise<Authentication | null> {
  const refreshed = rotateRefreshToken(rawRefreshToken);
  if (!refreshed) return null;
  return {
    body: await authenticationBody(refreshed.user),
    refreshToken: refreshed.refreshToken,
  };
}

export { createAuthentication, refreshAuthentication };
