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

function readBearerToken(authorizationHeader: string | undefined): string | null {
  const [scheme, token, extra] = authorizationHeader?.split(" ") ?? [];
  return scheme?.toLowerCase() === "bearer" && token && !extra ? token : null;
}

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

const requireAuth: RequestHandler = async (request, response, next) => {
  const user = await verifyAccessToken(request.headers.authorization);
  if (!user) {
    response.setHeader("WWW-Authenticate", "Bearer");
    response.status(401).json({ error: "Authentication required" });
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
