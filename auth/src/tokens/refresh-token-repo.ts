import { createHash, randomBytes, randomUUID } from "node:crypto";
import { database } from "../database.js";
import { REFRESH_TOKEN_TTL_MS } from "./token-config.js";
import type { PublicUser } from "../users/user.js";

type RefreshTokenRow = {
  family_id: string;
  user_id: string;
  expires_at: number;
  revoked_at: number | null;
  replaced_by_token_hash: string | null;
  email: string;
  email_verified_at: number | null;
  role: PublicUser["role"];
};
type RefreshResult = { refreshToken: string; user: PublicUser };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

function createRefreshToken(userId: string): string {
  const token = newToken();
  const now = Date.now();
  database.prepare("DELETE FROM refresh_tokens WHERE expires_at <= ?").run(now);
  database.prepare(`
    INSERT INTO refresh_tokens
      (token_hash, family_id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(token.hash, randomUUID(), userId, now + REFRESH_TOKEN_TTL_MS, now);
  return token.raw;
}

function revokeFamily(familyId: string, now: number): void {
  database.prepare(`
    UPDATE refresh_tokens
    SET revoked_at = COALESCE(revoked_at, ?)
    WHERE family_id = ?
  `).run(now, familyId);
}

function rotateRefreshToken(rawToken: string): RefreshResult | null {
  const tokenHash = hashToken(rawToken);
  const replacement = newToken();
  const now = Date.now();

  database.exec("BEGIN IMMEDIATE");
  try {
    const row = database.prepare(`
      SELECT
        refresh_tokens.family_id,
        refresh_tokens.user_id,
        refresh_tokens.expires_at,
        refresh_tokens.revoked_at,
        refresh_tokens.replaced_by_token_hash,
        users.email,
        users.email_verified_at,
        users.role
      FROM refresh_tokens
      JOIN users ON users.id = refresh_tokens.user_id
      WHERE refresh_tokens.token_hash = ?
    `).get(tokenHash) as RefreshTokenRow | undefined;

    if (!row) {
      database.exec("ROLLBACK");
      return null;
    }

    // Reuse of a rotated token indicates replay, so invalidate its replacement family.
    const replayed = row.revoked_at !== null && row.replaced_by_token_hash !== null;
    if (replayed) revokeFamily(row.family_id, now);

    if (row.revoked_at !== null || row.expires_at <= now) {
      database.exec("COMMIT");
      return null;
    }

    // Rotation makes the presented refresh token single-use.
    const revoked = database.prepare(`
      UPDATE refresh_tokens
      SET revoked_at = ?, replaced_by_token_hash = ?
      WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
    `).run(now, replacement.hash, tokenHash, now);
    if (Number(revoked.changes) !== 1) {
      database.exec("ROLLBACK");
      return null;
    }

    database.prepare(`
      INSERT INTO refresh_tokens
        (token_hash, family_id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      replacement.hash,
      row.family_id,
      row.user_id,
      now + REFRESH_TOKEN_TTL_MS,
      now,
    );
    database.exec("COMMIT");
    return {
      refreshToken: replacement.raw,
      user: {
        id: row.user_id,
        email: row.email,
        emailVerified: row.email_verified_at !== null,
        role: row.role,
      },
    };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function revokeRefreshToken(rawToken: string): void {
  const now = Date.now();
  const row = database.prepare(
    "SELECT family_id FROM refresh_tokens WHERE token_hash = ?",
  ).get(hashToken(rawToken)) as { family_id: string } | undefined;
  if (row) revokeFamily(row.family_id, now);
}

export { createRefreshToken, revokeRefreshToken, rotateRefreshToken };
