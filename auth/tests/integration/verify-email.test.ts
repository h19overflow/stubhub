import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { database } from "../../src/database.js";
import { readRefreshTokenCookie } from "../support/cookie.js";
import { resetDatabase, seedChallenge, seedUser } from "../support/database.js";
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

async function requestVerification(email: string): Promise<Response> {
  return fetch(`${server.origin}/verify-email/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

async function verifyEmail(email: string, code: string): Promise<Response> {
  return fetch(`${server.origin}/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
}

function challengeCount(userId: string): number {
  return (database.prepare(`
    SELECT COUNT(*) AS count
    FROM email_challenges
    WHERE user_id = ? AND purpose = 'verify_email'
  `).get(userId) as { count: number }).count;
}

function latestChallenge(userId: string): { failed_attempts: number; used_at: number | null } {
  const row = database.prepare(`
    SELECT failed_attempts, used_at
    FROM email_challenges
    WHERE user_id = ? AND purpose = 'verify_email'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId) as { failed_attempts: number; used_at: number | null };
  return { ...row };
}

async function assertInvalidCodeCase(options: Parameters<typeof seedChallenge>[0], code = "123456"): Promise<void> {
  const response = await verifyEmail("case@example.com", code);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid or expired verification code" });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal((database.prepare("SELECT email_verified_at FROM users WHERE id = ?").get(options.userId) as { email_verified_at: number | null }).email_verified_at, null);
}

test("POST /verify-email/request validates email", async () => {
  const response = await fetch(`${server.origin}/verify-email/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "not-email" }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "A valid email is required" });
});

test("POST /verify-email/request gives the same public response for unknown, verified, and unverified users", async () => {
  const verified = await seedUser({ email: "verified@example.com", emailVerified: true });
  const unverified = await seedUser({ email: "unverified@example.com", emailVerified: false });

  const responses = await Promise.all([
    requestVerification("unknown@example.com"),
    requestVerification("verified@example.com"),
    requestVerification("unverified@example.com"),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { message: "If verification is available, a code has been sent" });
  }
  assert.equal(challengeCount(verified.user.id), 0);
  assert.equal(challengeCount(unverified.user.id), 1);
});

test("POST /verify-email/request cooldown leaves one durable active challenge", async () => {
  const { user } = await seedUser({ email: "cooldown@example.com", emailVerified: false });

  const first = await requestVerification(user.email);
  const second = await requestVerification(user.email);

  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.equal(challengeCount(user.id), 1);
  assert.deepEqual(latestChallenge(user.id), { failed_attempts: 0, used_at: null });
});

test("POST /verify-email rejects invalid codes and increments durable attempts", async () => {
  const { user } = await seedUser({ email: "case@example.com", emailVerified: false });
  await seedChallenge({ userId: user.id, purpose: "verify_email", code: "111111" });

  await assertInvalidCodeCase({ userId: user.id, purpose: "verify_email" }, "222222");
  assert.deepEqual(latestChallenge(user.id), { failed_attempts: 1, used_at: null });
});

test("POST /verify-email rejects expired codes", async () => {
  const { user } = await seedUser({ email: "case@example.com", emailVerified: false });
  await seedChallenge({
    userId: user.id,
    purpose: "verify_email",
    code: "123456",
    expiresAt: Date.now() - 1,
  });

  await assertInvalidCodeCase({ userId: user.id, purpose: "verify_email" });
  assert.deepEqual(latestChallenge(user.id), { failed_attempts: 0, used_at: null });
});

test("POST /verify-email rejects locked codes", async () => {
  const { user } = await seedUser({ email: "case@example.com", emailVerified: false });
  await seedChallenge({
    userId: user.id,
    purpose: "verify_email",
    code: "123456",
    failedAttempts: 5,
  });

  await assertInvalidCodeCase({ userId: user.id, purpose: "verify_email" });
  assert.deepEqual(latestChallenge(user.id), { failed_attempts: 5, used_at: null });
});

test("POST /verify-email rejects consumed codes", async () => {
  const { user } = await seedUser({ email: "case@example.com", emailVerified: false });
  await seedChallenge({
    userId: user.id,
    purpose: "verify_email",
    code: "123456",
    usedAt: Date.now(),
  });

  await assertInvalidCodeCase({ userId: user.id, purpose: "verify_email" });
  assert.equal(latestChallenge(user.id).used_at !== null, true);
});

test("POST /verify-email consumes a valid code, verifies durably, and returns auth without secrets in the body", async () => {
  const { user } = await seedUser({ email: "success@example.com", emailVerified: false });
  await seedChallenge({ userId: user.id, purpose: "verify_email", code: "654321" });

  const response = await verifyEmail(user.email, "654321");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.user, { ...user, emailVerified: true });
  assert.equal(body.tokenType, "Bearer");
  assert.equal(typeof body.accessToken, "string");
  assert.equal(typeof body.expiresIn, "number");
  assert.ok(!("refreshToken" in body));
  assert.ok(!("password" in body.user));
  assert.ok(readRefreshTokenCookie(response.headers.get("set-cookie")).length > 0);
  assert.equal((database.prepare("SELECT email_verified_at FROM users WHERE id = ?").get(user.id) as { email_verified_at: number | null }).email_verified_at !== null, true);
  assert.equal(latestChallenge(user.id).used_at !== null, true);
});

test("concurrent POST /verify-email consumes one valid code exactly once", async () => {
  const { user } = await seedUser({ email: "race@example.com", emailVerified: false });
  await seedChallenge({ userId: user.id, purpose: "verify_email", code: "444444" });

  const responses = await Promise.all([verifyEmail(user.email, "444444"), verifyEmail(user.email, "444444")]);
  const statuses = responses.map((response) => response.status).sort();

  assert.deepEqual(statuses, [200, 400]);
  assert.equal((database.prepare("SELECT email_verified_at FROM users WHERE id = ?").get(user.id) as { email_verified_at: number | null }).email_verified_at !== null, true);
  assert.equal(latestChallenge(user.id).used_at !== null, true);
});
