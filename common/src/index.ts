import type { RequestHandler } from "express";
import { jwtVerify } from "jose";
import { z } from "zod";

type UserRole = "user" | "admin";

type AccessTokenClaims = {
 sub: string;
 email: string;
 emailVerified: boolean;
 role: UserRole;
};

type AuthenticatedUser = {
 id: string;
 email: string;
 emailVerified: boolean;
 role: UserRole;
};

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = "stubhub-identity";
const JWT_AUDIENCE = "stubhub-api";

const configuredSecret = process.env.JWT_SECRET;
if (!configuredSecret || Buffer.byteLength(configuredSecret, "utf8") < 32) {
 throw new Error("JWT_SECRET must contain at least 32 bytes");
}

const JWT_SECRET = new TextEncoder().encode(configuredSecret);

const accessTokenClaimsSchema = z.object({
 sub: z.uuid(),
 email: z.email(),
 emailVerified: z.boolean(),
 role: z.enum(["user", "admin"]),
});

/**
 * Extracts the raw JWT from an `Authorization: Bearer <token>` header.
 *
 * Flow: called by `verifyAccessToken` on every authenticated request and by
 * service-level auth checks. Returns null for missing/malformed headers so
 * callers can return 401 without throwing. Enforces the 3-part shape
 * (`Bearer token` exactly, no extra segments) to reject malformed tokens
 * early before crypto verification.
 */
function readBearerToken(
 authorizationHeader: string | undefined,
): string | null {
 const [scheme, token, extra] = authorizationHeader?.split(" ") ?? [];
 return scheme?.toLowerCase() === "bearer" && token && !extra ? token : null;
}

/**
 * Verifies the access token issued by the Identity service and returns the
 * authenticated user.
 *
 * Flow: Identity → `createAccessToken` signs; downstream services (Tickets,
 * Orders) call this to authenticate each request. Uses `jose.jwtVerify` with
 * issuer/audience/algorithm checks, then validates claims via Zod. Returns
 * null on any failure (missing, expired, wrong audience) so `requireAuth`
 * can send 401. Never throws for invalid tokens — keeps HTTP layer simple.
 */
async function verifyAccessToken(
 authorizationHeader: string | undefined,
): Promise<AuthenticatedUser | null> {
 const token = readBearerToken(authorizationHeader);
 if (!token) return null;

 try {
  const { payload } = await jwtVerify(token, JWT_SECRET, {
   algorithms: [JWT_ALGORITHM],
   audience: JWT_AUDIENCE,
   issuer: JWT_ISSUER,
   typ: "JWT",
  });
  const claims = accessTokenClaimsSchema.safeParse(payload);
  if (!claims.success) return null;
  return {
   id: claims.data.sub,
   email: claims.data.email,
   emailVerified: claims.data.emailVerified,
   role: claims.data.role,
  };
 } catch {
  return null;
 }
}

/**
 * Express middleware that enforces authentication for protected routes.
 *
 * Flow: runs before route handler → calls `verifyAccessToken` → on success
 * attaches `user` to `response.locals` for downstream handlers (e.g. ticket
 * ownership checks, order creation); on failure sends 401 with
 * `WWW-Authenticate: Bearer`. Shared via `@stubhub/common` so all services
 * enforce the same JWT contract.
 */
const requireAuth: RequestHandler = async (request, response, next) => {
 const user = await verifyAccessToken(request.headers.authorization);
 if (!user) {
  response.setHeader("WWW-Authenticate", "Bearer");
  response
   .status(401)
   .json({ error: "Authentication required", code: "authentication_required" });
  return;
 }

 response.locals.user = user;
 next();
};

export {
 ACCESS_TOKEN_TTL_SECONDS,
 JWT_ALGORITHM,
 JWT_AUDIENCE,
 JWT_ISSUER,
 JWT_SECRET,
 requireAuth,
 verifyAccessToken,
};
export type { AccessTokenClaims, AuthenticatedUser, UserRole };

export * from "./events/index.js";
export * from "./sqlite/index.js";
export * from "./errors/index.js";
export * from "./retry/index.js";
