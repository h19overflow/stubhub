import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { consumeChallenge } from "../../src/challenges/email-challenge-repo.js";
import { database } from "../../src/database.js";
import { resetDatabase, seedChallenge, seedUser } from "../support/database.js";

beforeEach(() => resetDatabase());

test("a challenge can be consumed only once under concurrent use", async () => {
  const { user } = await seedUser({ email: "race@example.com" });
  const { code } = await seedChallenge({ userId: user.id, purpose: "verify_email" });

  const results = await Promise.all([
    consumeChallenge(user.email, code, "verify_email"),
    consumeChallenge(user.email, code, "verify_email"),
  ]);

  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.find(Boolean)?.id, user.id);

  const challenge = database.prepare(`
    SELECT used_at, failed_attempts
    FROM email_challenges
    WHERE user_id = ? AND purpose = ?
  `).get(user.id, "verify_email") as { used_at: number | null; failed_attempts: number };
  const storedUser = database.prepare(`
    SELECT email_verified_at
    FROM users
    WHERE id = ?
  `).get(user.id) as { email_verified_at: number | null };

  assert.notEqual(challenge.used_at, null);
  assert.equal(challenge.failed_attempts, 0);
  assert.notEqual(storedUser.email_verified_at, null);
});

test("a losing concurrent consume leaves one durable success and no second-use side effects", async () => {
  const { user } = await seedUser({ email: "signin-race@example.com", emailVerified: true });
  const { code } = await seedChallenge({ userId: user.id, purpose: "signin" });

  const [valid, replay] = await Promise.all([
    consumeChallenge(user.email, code, "signin"),
    consumeChallenge(user.email, code, "signin"),
  ]);

  assert.equal([valid, replay].filter(Boolean).length, 1);
  const challenge = database.prepare(`
    SELECT used_at, failed_attempts
    FROM email_challenges
    WHERE user_id = ? AND purpose = ?
  `).get(user.id, "signin") as { used_at: number | null; failed_attempts: number };

  assert.notEqual(challenge.used_at, null);
  assert.equal(challenge.failed_attempts, 0);
  assert.equal(await consumeChallenge(user.email, code, "signin"), null);
});
