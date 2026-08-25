import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import {
  createAccessToken,
  verifyAccessToken,
} from "../../src/tokens/access-token.js";
import {
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_SECRET,
} from "../../src/tokens/token-config.js";

const user = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  email: "test@example.com",
  emailVerified: true,
  role: "user" as const,
};

async function signToken(
  claims: Record<string, unknown>,
  options: {
    secret?: Uint8Array;
    algorithm?: string;
    issuer?: string;
    audience?: string;
    expiresIn?: string;
    subject?: string;
  } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: options.algorithm ?? JWT_ALGORITHM, typ: "JWT" })
    .setIssuer(options.issuer ?? JWT_ISSUER)
    .setAudience(options.audience ?? JWT_AUDIENCE)
    .setSubject(options.subject ?? user.id)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "15m")
    .sign(options.secret ?? JWT_SECRET);
}

test("verifies an access token created for a user", async () => {
  const token = await createAccessToken(user);

  assert.deepEqual(await verifyAccessToken(`Bearer ${token}`), user);
});

test("rejects missing and malformed bearer tokens", async () => {
  assert.equal(await verifyAccessToken(undefined), null);
  assert.equal(await verifyAccessToken("Basic abc"), null);
  assert.equal(await verifyAccessToken("Bearer"), null);
  assert.equal(await verifyAccessToken("Bearer invalid"), null);
  assert.equal(await verifyAccessToken("Bearer one two"), null);
});

test("rejects tokens with a malformed protected header", async () => {
  const token = await createAccessToken(user);
  const [, payload, signature] = token.split(".");

  assert.equal(await verifyAccessToken(`Bearer not-base64.${payload}.${signature}`), null);
});

test("rejects tokens signed with the wrong secret", async () => {
  const token = await signToken(
    { email: user.email, emailVerified: user.emailVerified, role: user.role },
    { secret: new TextEncoder().encode("x".repeat(32)) },
  );

  assert.equal(await verifyAccessToken(`Bearer ${token}`), null);
});

test("rejects tokens with wrong issuer or audience", async () => {
  const claims = { email: user.email, emailVerified: user.emailVerified, role: user.role };

  assert.equal(
    await verifyAccessToken(`Bearer ${await signToken(claims, { issuer: "other" })}`),
    null,
  );
  assert.equal(
    await verifyAccessToken(`Bearer ${await signToken(claims, { audience: "other" })}`),
    null,
  );
});

test("rejects expired tokens", async () => {
  const token = await signToken(
    { email: user.email, emailVerified: user.emailVerified, role: user.role },
    { expiresIn: "-1s" },
  );

  assert.equal(await verifyAccessToken(`Bearer ${token}`), null);
});

test("rejects constructible tokens using an unexpected algorithm", async () => {
  const token = await signToken(
    { email: user.email, emailVerified: user.emailVerified, role: user.role },
    { algorithm: "HS384" },
  );

  assert.equal(await verifyAccessToken(`Bearer ${token}`), null);
});

test("rejects tokens missing required public-user claims", async () => {
  const token = await signToken({ email: user.email, emailVerified: user.emailVerified });

  assert.equal(await verifyAccessToken(`Bearer ${token}`), null);
});

test("rejects tokens with invalid public-user claims", async () => {
  const token = await signToken(
    { email: "not-an-email", emailVerified: "yes", role: "owner" },
    { subject: "not-a-uuid" },
  );

  assert.equal(await verifyAccessToken(`Bearer ${token}`), null);
});
