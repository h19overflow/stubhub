import { REFRESH_TOKEN_TTL_MS } from "./token-config.js";

const COOKIE_NAME = "refreshToken";
const cookieSecurity = process.env.NODE_ENV === "production" ? "; Secure" : "";

function readRefreshToken(cookieHeader: string | undefined): string | null {
  return cookieHeader
    ?.split(";")
    .map((cookie) => cookie.trim().split("="))
    .find(([name]) => name === COOKIE_NAME)
    ?.slice(1)
    .join("=") ?? null;
}

function refreshTokenCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${REFRESH_TOKEN_TTL_MS / 1_000}${cookieSecurity}`;
}

function clearRefreshTokenCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${cookieSecurity}`;
}

export { clearRefreshTokenCookie, readRefreshToken, refreshTokenCookie };
