import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { database } from "../../src/database.js";
import type { TestServer } from "../support/server.js";
import { startTestServer } from "../support/server.js";
import { resetDatabase, seedChallenge, seedUser } from "../support/database.js";
import { readRefreshTokenCookie } from "../support/cookie.js";

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

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${server.origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function signin(email: string, password: string): Promise<Response> {
  return post("/signin", { email, password });
}

async function signinCode(email: string, code: string): Promise<Response> {
  return post("/signin/code", { email, code });
}

function userState(userId: string): { failed_signin_attempts: number; signin_locked_until: number | null } {
  const row = database.prepare(`
    SELECT failed_signin_attempts, signin_locked_until
    FROM users
    WHERE id = ?
  `).get(userId) as { failed_signin_attempts: number; signin_locked_until: number | null };
  return { ...row };
}

function activeSigninChallengeCount(userId: string): number {
  const row = database.prepare(`
    SELECT COUNT(*) AS count
    FROM email_challenges
    WHERE user_id = ? AND purpose = 'signin' AND used_at IS NULL
  `).get(userId) as { count: number };
  return row.count;
}

function count(sql: string, ...parameters: string[]): number {
  return (database.prepare(sql).get(...parameters) as { count: number }).count;
}

function challengeState(userId: string): { failed_attempts: number; used_at: number | null } {
  const row = database.prepare(`
    SELECT failed_attempts, used_at
    FROM email_challenges
    WHERE user_id = ? AND purpose = 'signin'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId) as { failed_attempts: number; used_at: number | null };
  return { ...row };
}

test("POST /signin rejects an invalid request", async () => {
  const response = await post("/signin", { email: "not-an-email", password: "short" });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "A valid email and password of 8 to 256 characters are required" });
  assert.equal(count("SELECT COUNT(*) AS count FROM email_challenges"), 0);
});

test("POST /signin returns the same public error for unknown email and wrong password", async () => {
  const { user, password } = await seedUser({ email: "known@example.com", emailVerified: true });

  const unknown = await signin("missing@example.com", password);
  const wrongPassword = await signin(user.email, "wrong-password");

  assert.equal(unknown.status, 401);
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(await unknown.json(), { error: "Invalid email or password" });
  assert.deepEqual(await wrongPassword.json(), { error: "Invalid email or password" });
  assert.deepEqual(userState(user.id), { failed_signin_attempts: 1, signin_locked_until: null });
  assert.equal(activeSigninChallengeCount(user.id), 0);
});

test("POST /signin rejects an unverified account after a valid password", async () => {
  const { user, password } = await seedUser({ emailVerified: false });

  const response = await signin(user.email, password);

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Email verification required" });
  assert.deepEqual(userState(user.id), { failed_signin_attempts: 0, signin_locked_until: null });
  assert.equal(activeSigninChallengeCount(user.id), 0);
});

test("POST /signin reports email unavailable after a valid password without requiring SMTP success", async () => {
  const { user, password } = await seedUser({ emailVerified: true });

  const response = await signin(user.email, password);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Sign-in email is temporarily unavailable" });
  assert.deepEqual(userState(user.id), { failed_signin_attempts: 0, signin_locked_until: null });
  assert.equal(activeSigninChallengeCount(user.id), 1);
});

test("POST /signin locks an account for five bad passwords and returns Retry-After while locked", async () => {
  const { user, password } = await seedUser({ emailVerified: true });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await signin(user.email, "wrong-password");
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Invalid email or password" });
    assert.deepEqual(userState(user.id), { failed_signin_attempts: attempt, signin_locked_until: null });
  }

  const lockResponse = await signin(user.email, "wrong-password");
  assert.equal(lockResponse.status, 401);
  assert.deepEqual(await lockResponse.json(), { error: "Invalid email or password" });
  const locked = userState(user.id);
  assert.equal(locked.failed_signin_attempts, 5);
  assert.notEqual(locked.signin_locked_until, null);

  const stillWrong = await signin(user.email, "wrong-password");
  assert.equal(stillWrong.status, 429);
  assert.equal(stillWrong.headers.get("retry-after"), "300");
  assert.deepEqual(await stillWrong.json(), { error: "Too many attempts. Try again later" });
  assert.deepEqual(userState(user.id), locked);

  const correctWhileLocked = await signin(user.email, password);
  assert.equal(correctWhileLocked.status, 429);
  assert.equal(correctWhileLocked.headers.get("retry-after"), "300");
  assert.deepEqual(await correctWhileLocked.json(), { error: "Too many attempts. Try again later" });
  assert.deepEqual(userState(user.id), locked);
  assert.equal(activeSigninChallengeCount(user.id), 0);
});

test("POST /signin/code rejects an invalid body", async () => {
  const response = await post("/signin/code", { email: "user@example.com", code: "123" });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "A valid email and six-digit code are required" });
  assert.equal(count("SELECT COUNT(*) AS count FROM refresh_tokens"), 0);
});

test("POST /signin/code rejects an incorrect challenge and records the failed attempt", async () => {
  const { user } = await seedUser({ emailVerified: true });
  await seedChallenge({ userId: user.id, purpose: "signin", code: "123456" });

  const response = await signinCode(user.email, "000000");

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Invalid or expired sign-in code" });
  assert.deepEqual(challengeState(user.id), { failed_attempts: 1, used_at: null });
  assert.equal(count("SELECT COUNT(*) AS count FROM refresh_tokens"), 0);
});

test("POST /signin/code rejects an expired challenge without incrementing attempts", async () => {
  const { user } = await seedUser({ emailVerified: true });
  await seedChallenge({ userId: user.id, purpose: "signin", code: "123456", expiresAt: Date.now() - 1 });

  const response = await signinCode(user.email, "123456");

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Invalid or expired sign-in code" });
  assert.deepEqual(challengeState(user.id), { failed_attempts: 0, used_at: null });
  assert.equal(count("SELECT COUNT(*) AS count FROM refresh_tokens"), 0);
});

test("POST /signin/code rejects a locked challenge", async () => {
  const { user } = await seedUser({ emailVerified: true });
  await seedChallenge({ userId: user.id, purpose: "signin", code: "123456", failedAttempts: 5 });

  const response = await signinCode(user.email, "123456");

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Invalid or expired sign-in code" });
  assert.deepEqual(challengeState(user.id), { failed_attempts: 5, used_at: null });
  assert.equal(count("SELECT COUNT(*) AS count FROM refresh_tokens"), 0);
});

test("POST /signin/code rejects a consumed challenge", async () => {
  const { user } = await seedUser({ emailVerified: true });
  await seedChallenge({ userId: user.id, purpose: "signin", code: "123456", usedAt: Date.now() });

  const response = await signinCode(user.email, "123456");

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Invalid or expired sign-in code" });
  assert.notEqual(challengeState(user.id).used_at, null);
  assert.equal(count("SELECT COUNT(*) AS count FROM refresh_tokens"), 0);
});

test("POST /signin/code authenticates with a valid code and refresh cookie", async () => {
  const { user } = await seedUser({ emailVerified: true });
  const { code } = await seedChallenge({ userId: user.id, purpose: "signin" });

  const response = await signinCode(user.email, code);

  assert.equal(response.status, 200);
  const refreshToken = readRefreshTokenCookie(response.headers.get("set-cookie"));
  assert.ok(refreshToken);
  const body = await response.json();
  assert.deepEqual(body.user, user);
  assert.equal(body.tokenType, "Bearer");
  assert.equal(typeof body.accessToken, "string");
  assert.equal(typeof body.expiresIn, "number");
  assert.notEqual(challengeState(user.id).used_at, null);
  assert.equal(count("SELECT COUNT(*) AS count FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL", user.id), 1);
});

test("POST /signin/code consumes a challenge only once under concurrent requests", async () => {
  const { user } = await seedUser({ emailVerified: true });
  const { code } = await seedChallenge({ userId: user.id, purpose: "signin" });

  const responses = await Promise.all([signinCode(user.email, code), signinCode(user.email, code)]);
  const statuses = responses.map((response) => response.status).sort((left, right) => left - right);

  assert.deepEqual(statuses, [200, 401]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.equal(bodies.filter((body) => "accessToken" in body).length, 1);
  assert.equal(bodies.filter((body) => body.error === "Invalid or expired sign-in code").length, 1);
  assert.notEqual(challengeState(user.id).used_at, null);
  assert.equal(count("SELECT COUNT(*) AS count FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL", user.id), 1);
});
