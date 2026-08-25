import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { database } from "../../src/database.js";
import { resetDatabase, seedUser } from "../support/database.js";
import { startTestServer, type TestServer } from "../support/server.js";

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

async function signup(body: unknown): Promise<Response> {
  return fetch(`${server.origin}/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function activeChallenges(userId: string): Array<{ purpose: string; used_at: number | null }> {
  return database.prepare(`
    SELECT purpose, used_at
    FROM email_challenges
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId) as Array<{ purpose: string; used_at: number | null }>;
}
function count(sql: string, ...parameters: string[]): number {
  return (database.prepare(sql).get(...parameters) as { count: number }).count;
}


test("POST /signup validates credentials", async () => {
  const response = await signup({ email: "not-email", password: "short" });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "A valid email and password of 8 to 256 characters are required",
  });
  assert.equal(count("SELECT COUNT(*) AS count FROM users"), 0);
});

test("POST /signup normalizes email, creates a default public user, and stores a verification challenge", async () => {
  const response = await signup({ email: "  New.User@Example.COM  ", password: "correct horse battery" });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.verificationRequired, true);
  assert.equal(body.emailSent, false);
  assert.deepEqual(body.user, {
    id: body.user.id,
    email: "new.user@example.com",
    emailVerified: false,
    role: "user",
  });
  assert.ok(!("password" in body.user));
  assert.ok(!("passwordHash" in body.user));
  assert.ok(!("accessToken" in body));
  assert.equal(response.headers.get("set-cookie"), null);
  const storedUser = database.prepare(`
    SELECT id, email, email_verified_at, role
    FROM users
    WHERE id = ?
  `).get(body.user.id) as { id: string; email: string; email_verified_at: number | null; role: string };
  assert.deepEqual({ ...storedUser }, {
    id: body.user.id,
    email: "new.user@example.com",
    email_verified_at: null,
    role: "user",
  });
  assert.deepEqual(activeChallenges(body.user.id).map(({ purpose, used_at }) => ({ purpose, used_at })), [
    { purpose: "verify_email", used_at: null },
  ]);
});

test("POST /signup rejects duplicate email without issuing another challenge", async () => {
  const { user } = await seedUser({ email: "taken@example.com" });

  const response = await signup({ email: "TAKEN@example.com", password: "correct horse battery" });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "Email is already registered" });
  assert.equal(count("SELECT COUNT(*) AS count FROM users WHERE email = ?", "taken@example.com"), 1);
  assert.equal(activeChallenges(user.id).length, 0);
});

test("concurrent POST /signup accepts exactly one duplicate email request", async () => {
  const requests = await Promise.all([
    signup({ email: "race@example.com", password: "correct horse battery" }),
    signup({ email: "race@example.com", password: "correct horse battery" }),
  ]);
  const statuses = requests.map((response) => response.status).sort();

  assert.deepEqual(statuses, [201, 409]);
  assert.equal(count("SELECT COUNT(*) AS count FROM users WHERE email = ?", "race@example.com"), 1);
  const user = database.prepare("SELECT id FROM users WHERE email = ?").get("race@example.com") as { id: string };
  assert.equal(activeChallenges(user.id).length, 1);
});
