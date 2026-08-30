import { REFRESH_TOKEN_TTL_MS } from "./token-config.js";

const COOKIE_NAME = "refreshToken";
const cookieSecurity = process.env.NODE_ENV === "production" ? "; Secure" : "";

/**
 * Parses the refreshToken HttpOnly cookie from the Cookie header.
 *
 * Flow: refresh and signout routes call this to extract the opaque token
 * before DB lookup. Handles missing header and joined = in value. Returns
 * null if cookie absent.
 */
function readRefreshToken(cookieHeader: string | undefined): string | null {
  return cookieHeader
    ?.split(";")
    .map((cookie) => cookie.trim().split("="))
    .find(([name]) => name === COOKIE_NAME)
    ?.slice(1)
    .join("=") ?? null;
}

/**
 * Serializes a Set-Cookie header for the refresh token.
 *
 * Flow: called after createAuthentication/refreshAuthentication to set the
 * HttpOnly, Lax, Path=/ cookie with Max-Age = REFRESH_TOKEN_TTL_MS. Adds
 * Secure in production. Caller sets header via res.setHeader.
 */
function refreshTokenCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${REFRESH_TOKEN_TTL_MS / 1_000}${cookieSecurity}`;
}

/**
 * Serializes a Set-Cookie that clears the refresh token (Max-Age=0).
 *
 * Flow: signout and failed refresh use this to remove the browser cookie.
 * Same attributes as refreshTokenCookie so overwrite succeeds.
 */
function clearRefreshTokenCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${cookieSecurity}`;
}

export { clearRefreshTokenCookie, readRefreshToken, refreshTokenCookie };
