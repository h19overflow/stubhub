import { jwtVerify } from "jose";
import { z } from "zod";
import {
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_SECRET,
} from "./token-config.js";

const accessTokenClaimsSchema = z.object({
  sub: z.uuid(),
  email: z.email(),
  emailVerified: z.boolean(),
  role: z.enum(["user", "admin"]),
});

type AuthenticatedUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "admin";
};

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

export { verifyAccessToken };
export type { AuthenticatedUser };
