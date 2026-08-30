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

/**
 * SHA-256 hashes an opaque refresh token for storage.
 *
 * Flow: internal helper; DB stores only hash, never raw token, so a DB leak
 * does not yield usable refresh tokens. Used by all repo functions.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generates a fresh opaque refresh token and its hash.
 *
 * Flow: createRefreshToken and rotateRefreshToken call this to get
 * {raw, hash}. Raw is 32 random bytes base64url; hash is SHA-256. Raw is
 * returned to cookie, hash goes to SQLite.
 */
function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

/**
 * Creates the first refresh token in a family for a user.
 *
 * Flow: createAuthentication -> calls this. Prunes expired rows, INSERTs a
 * new row with new family_id (randomUUID), user_id, expires_at (now+TTL).
 * Family groups all rotations of the same login; revokeFamily invalidates
 * the whole family on replay.
 */
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

/**
 * Revokes every token in a refresh family (sets revoked_at if null).
 *
 * Flow: called on detected replay (reuse of rotated token) and on signout
 * (revokeRefreshToken). Uses COALESCE so first revocation timestamp wins.
 * Makes all future rotations for that family fail.
 */
function revokeFamily(familyId: string, now: number): void {
  database.prepare(`
    UPDATE refresh_tokens
    SET revoked_at = COALESCE(revoked_at, ?)
    WHERE family_id = ?
  `).run(now, familyId);
}

/**
 * Atomically rotates a refresh token (single-use) and detects replay.
 *
 * Flow: refreshAuthentication -> calls this in BEGIN IMMEDIATE. Steps: SELECT
 * token row + user -> if missing return null -> if already revoked with
 * replaced_by_token_hash, it is a replay => revokeFamily and return null ->
 * if revoked or expired return null -> UPDATE old row revoked_at/replaced_by
 * -> INSERT replacement row in same family with new hash/TTL -> COMMIT ->
 * return {refreshToken, user}. Rollback on contention. Guarantees one-time use.
 */
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

/**
 * Revokes the family containing the given raw refresh token (signout).
 *
 * Flow: POST /signout -> calls this. Looks up family_id by hash then
 * revokeFamily. No-op if token not found (already expired/cleared). Does not
 * throw for unknown tokens.
 */
function revokeRefreshToken(rawToken: string): void {
  const now = Date.now();
  const row = database.prepare(
    "SELECT family_id FROM refresh_tokens WHERE token_hash = ?",
  ).get(hashToken(rawToken)) as { family_id: string } | undefined;
  if (row) revokeFamily(row.family_id, now);
}

export { createRefreshToken, revokeRefreshToken, rotateRefreshToken };
