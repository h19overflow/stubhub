import { createHmac, randomUUID } from "node:crypto";

type TestUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "admin";
};

function readJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required for Orders tests");
  return secret;
}

const jwtSecret = readJwtSecret();

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function issueAccessToken(overrides: Partial<TestUser> = {}): {
  token: string;
  user: TestUser;
} {
  const user: TestUser = {
    id: randomUUID(),
    email: "buyer@example.com",
    emailVerified: true,
    role: "user",
    ...overrides,
  };
  const now = Math.floor(Date.now() / 1_000);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    sub: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
    iss: "stubhub-identity",
    aud: "stubhub-api",
    iat: now,
    exp: now + 5 * 60,
  });
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac("sha256", jwtSecret)
    .update(unsignedToken)
    .digest("base64url");

  return { token: `${unsignedToken}.${signature}`, user };
}

export type { TestUser };
