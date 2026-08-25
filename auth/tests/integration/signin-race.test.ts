import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { database } from "../../src/database.js";
import { resetDatabase, seedUser } from "../support/database.js";
import type { TestServer } from "../support/server.js";
import { startTestServer } from "../support/server.js";

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  resetDatabase();
});

async function signin(email: string, password: string): Promise<Response> {
  return fetch(`${server.origin}/signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function userState(userId: string): { failed_signin_attempts: number; signin_locked_until: number | null } {
  const row = database.prepare(`
    SELECT failed_signin_attempts, signin_locked_until
    FROM users
    WHERE id = ?
  `).get(userId) as { failed_signin_attempts: number; signin_locked_until: number | null };
  return { ...row };
}

test("parallel wrong passwords durably lock after five attempts", async () => {
  const { user, password } = await seedUser({ email: "signin-race@example.com", emailVerified: true });

  const responses = await Promise.all(
    Array.from({ length: 5 }, () => signin(user.email, "wrong-password")),
  );

  assert.deepEqual(responses.map((response) => response.status).sort(), [401, 401, 401, 401, 401]);
  for (const response of responses) {
    assert.deepEqual(await response.json(), { error: "Invalid email or password" });
  }

  const locked = userState(user.id);
  assert.equal(locked.failed_signin_attempts, 5);
  assert.notEqual(locked.signin_locked_until, null);

  const correctWhileLocked = await signin(user.email, password);
  assert.equal(correctWhileLocked.status, 429);
  assert.equal(correctWhileLocked.headers.get("retry-after"), "300");
  assert.deepEqual(await correctWhileLocked.json(), { error: "Too many attempts. Try again later" });
  assert.deepEqual(userState(user.id), locked);
});
