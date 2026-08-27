import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_SECRET,
  type AccessTokenClaims,
} from "@stubhub/common";
import { SignJWT } from "jose";
import type { PublicUser } from "../users/user.js";

async function createAccessToken(user: PublicUser): Promise<string> {
  // A JWT is signed, not encrypted. Keep credentials and other secrets out of its claims.
  return new SignJWT({
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
  } satisfies Omit<AccessTokenClaims, "sub">)
    .setProtectedHeader({ alg: JWT_ALGORITHM, typ: "JWT" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(JWT_SECRET);
}

export { createAccessToken };
