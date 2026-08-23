import { randomInt, randomUUID } from "node:crypto";
import { database } from "../database.js";
import type { ChallengePurpose } from "../email.js";
import { dummySecretCheck, hashSecret, secretMatches } from "../secret.js";
import type { PublicUser } from "./user-repo.js";

type ChallengeRow = {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: number;
  failed_attempts: number;
  email: string;
  email_verified_at: number | null;
};

const CHALLENGE_TTL_MS = 10 * 60 * 1_000;
const CHALLENGE_COOLDOWN_MS = 60 * 1_000;

async function issueChallenge(user: PublicUser, purpose: ChallengePurpose): Promise<string | null> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = await hashSecret(code);
  const now = Date.now();

  database.exec("BEGIN IMMEDIATE");
  try {
    const active = database.prepare(`
      SELECT created_at
      FROM email_challenges
      WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(user.id, purpose, now) as { created_at: number } | undefined;

    if (active && active.created_at > now - CHALLENGE_COOLDOWN_MS) {
      database.exec("COMMIT");
      return null;
    }

    database.prepare(`
      UPDATE email_challenges
      SET used_at = ?
      WHERE user_id = ? AND purpose = ? AND used_at IS NULL
    `).run(now, user.id, purpose);
    database.prepare(`
      INSERT INTO email_challenges
        (id, user_id, purpose, code_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), user.id, purpose, codeHash, now + CHALLENGE_TTL_MS, now);
    database.exec("COMMIT");
    return code;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

async function consumeChallenge(
  email: string,
  code: string,
  purpose: ChallengePurpose,
): Promise<PublicUser | null> {
  const now = Date.now();
  const row = database.prepare(`
    SELECT
      email_challenges.id,
      email_challenges.user_id,
      email_challenges.code_hash,
      email_challenges.expires_at,
      email_challenges.failed_attempts,
      users.email,
      users.email_verified_at
    FROM email_challenges
    JOIN users ON users.id = email_challenges.user_id
    WHERE users.email = ?
      AND email_challenges.purpose = ?
      AND email_challenges.used_at IS NULL
    ORDER BY email_challenges.created_at DESC
    LIMIT 1
  `).get(email, purpose) as ChallengeRow | undefined;

  if (!row) {
    await dummySecretCheck(code, "missing-challenge");
    return null;
  }

  const matches = await secretMatches(code, row.code_hash);
  if (!matches || row.expires_at <= now || row.failed_attempts >= 5) {
    if (row.expires_at > now && row.failed_attempts < 5) {
      database.prepare(`
        UPDATE email_challenges
        SET failed_attempts = failed_attempts + 1
        WHERE id = ? AND used_at IS NULL AND failed_attempts < 5
      `).run(row.id);
    }
    return null;
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    const consumed = database.prepare(`
      UPDATE email_challenges
      SET used_at = ?
      WHERE id = ? AND used_at IS NULL AND expires_at > ? AND failed_attempts < 5
    `).run(now, row.id, now);
    if (Number(consumed.changes) !== 1) {
      database.exec("ROLLBACK");
      return null;
    }

    if (purpose === "verify_email") {
      database.prepare(`
        UPDATE users
        SET email_verified_at = COALESCE(email_verified_at, ?)
        WHERE id = ?
      `).run(now, row.user_id);
    }
    database.exec("COMMIT");
    return { id: row.user_id, email: row.email, emailVerified: true };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export { consumeChallenge, issueChallenge };
