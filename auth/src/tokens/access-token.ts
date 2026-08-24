import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_SECRET,
} from "./token-config.js";
import type { PublicUser } from "../users/user.js";

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

async function createAccessToken(user: PublicUser): Promise<string> {
  // A JWT is signed, not encrypted. Keep credentials and other secrets out of its claims.
  return new SignJWT({
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
  })
    .setProtectedHeader({ alg: JWT_ALGORITHM, typ: "JWT" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(JWT_SECRET);
}

async function verifyAccessToken(
  authorizationHeader: string | undefined,
): Promise<PublicUser | null> {
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

export { createAccessToken, verifyAccessToken };
