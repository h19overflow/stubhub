import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { database } from "../../src/database.js";
import { resetDatabase, seedUser } from "../support/database.js";

beforeEach(() => resetDatabase());

test("users enforce unique email and allowed roles", async () => {
  const { user } = await seedUser({ email: "same@example.com", role: "admin" });

  assert.equal(user.role, "admin");
  assert.throws(
    () =>
      database.prepare(`
        INSERT INTO users (id, email, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run("duplicate-email", "same@example.com", "hash", "user", Date.now()),
    /UNIQUE constraint failed: users\.email/,
  );
  assert.throws(
    () =>
      database.prepare(`
        INSERT INTO users (id, email, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run("bad-role", "bad-role@example.com", "hash", "seller", Date.now()),
    /CHECK constraint failed/,
  );
});

test("deleting a user cascades challenges and refresh tokens", async () => {
  const { user } = await seedUser();
  const now = Date.now();

  database.prepare(`
    INSERT INTO email_challenges
      (id, user_id, purpose, code_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("challenge-to-cascade", user.id, "signin", "hash", now + 60_000, now);
  database.prepare(`
    INSERT INTO refresh_tokens
      (token_hash, family_id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run("token-to-cascade", "family-to-cascade", user.id, now + 60_000, now);

  database.prepare("DELETE FROM users WHERE id = ?").run(user.id);

  const challenges = database.prepare("SELECT COUNT(*) AS count FROM email_challenges").get() as {
    count: number;
  };
  const refreshTokens = database.prepare("SELECT COUNT(*) AS count FROM refresh_tokens").get() as {
    count: number;
  };
  assert.equal(challenges.count, 0);
  assert.equal(refreshTokens.count, 0);
});
