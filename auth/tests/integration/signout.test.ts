import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { database } from "../../src/database.js";
import { createAuthentication } from "../../src/tokens/authentication.js";
import { resetDatabase, seedUser } from "../support/database.js";
import { startTestServer, type TestServer } from "../support/server.js";

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

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function signout(cookie?: string): Promise<Response> {
  return fetch(`${server.origin}/signout`, {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
  });
}

async function issueAuthentication() {
  const { user } = await seedUser({ emailVerified: true });
  const authentication = await createAuthentication(user);
  return { user, ...authentication };
}

function assertClearedCookie(response: Response): void {
  assert.match(response.headers.get("set-cookie") ?? "", /refreshToken=;.*Max-Age=0/);
}

test("POST /signout clears the cookie when no refresh cookie is present", async () => {
  const response = await signout();

  assert.equal(response.status, 204);
  assertClearedCookie(response);
  assert.equal(await response.text(), "");
});

test("POST /signout clears the cookie when the refresh token is invalid", async () => {
  const response = await signout("refreshToken=invalid");

  assert.equal(response.status, 204);
  assertClearedCookie(response);
});

test("POST /signout revokes a valid refresh-token family and remains idempotent", async () => {
  const { refreshToken } = await issueAuthentication();

  const first = await signout(`refreshToken=${refreshToken}`);
  const second = await signout(`refreshToken=${refreshToken}`);
  const revoked = database.prepare("SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?").get(hash(refreshToken)) as { revoked_at: number | null };

  assert.equal(first.status, 204);
  assert.equal(second.status, 204);
  assertClearedCookie(first);
  assertClearedCookie(second);
  assert.notEqual(revoked.revoked_at, null);
});

test("POST /signout rejects later refreshes but leaves existing access tokens valid", async () => {
  const { user, body, refreshToken } = await issueAuthentication();

  const signedOut = await signout(`refreshToken=${refreshToken}`);
  const refreshed = await fetch(`${server.origin}/refresh`, {
    method: "POST",
    headers: { cookie: `refreshToken=${refreshToken}` },
  });
  const currentUser = await fetch(`${server.origin}/current-user`, {
    headers: { authorization: `Bearer ${body.accessToken}` },
  });

  assert.equal(signedOut.status, 204);
  assert.equal(refreshed.status, 401);
  assert.deepEqual(await currentUser.json(), { user });
});
