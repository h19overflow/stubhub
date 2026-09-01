import { JWT_AUDIENCE, JWT_ISSUER } from "@stubhub/common";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { SignJWT } from "jose";
import { createAccessToken } from "../../src/tokens/access-token.js";
import { resetDatabase } from "../support/database.js";
import { startTestServer, type TestServer } from "../support/server.js";

const user = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  email: "test@example.com",
  emailVerified: true,
  role: "user" as const,
};

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

beforeEach(() => {
  resetDatabase();
});

after(async () => {
  await server.close();
});

async function requestCurrentUser(authorization?: string): Promise<Response> {
  return fetch(`${server.origin}/current-user`, {
    headers: authorization ? { authorization } : undefined,
  });
}

test("GET /current-user rejects a missing bearer token", async () => {
  const response = await requestCurrentUser();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.deepEqual(await response.json(), {
    error: "Authentication required",
    code: "authentication_required",
  });
});

test("GET /current-user rejects a malformed bearer header", async () => {
  const response = await requestCurrentUser("Bearer token extra");

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.deepEqual(await response.json(), {
    error: "Authentication required",
    code: "authentication_required",
  });
});

test("GET /current-user rejects a wrong-signature token", async () => {
  const token = await new SignJWT({
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode("wrong-secret-with-at-least-32-bytes"));

  const response = await requestCurrentUser(`Bearer ${token}`);

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.deepEqual(await response.json(), {
    error: "Authentication required",
    code: "authentication_required",
  });
});

test("GET /current-user returns exactly the public user for a valid token", async () => {
  const token = await createAccessToken(user);
  const response = await requestCurrentUser(`Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("www-authenticate"), null);
  assert.deepEqual(await response.json(), { user });
});
