import { createHash, randomBytes } from "node:crypto";
import { database } from "../database.js";
import type { PublicUser } from "./user-repo.js";

type SessionUserRow = {
  id: string;
  email: string;
  email_verified_at: number | null;
};

const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
const cookieSecurity = process.env.NODE_ENV === "production" ? "; Secure" : "";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createSession(userId: string): string {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  database.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(hashToken(token), userId, now + SESSION_TTL_MS, now);
  return token;
}

function readSessionToken(cookieHeader: string | undefined): string | null {
  return cookieHeader
    ?.split(";")
    .map((cookie) => cookie.trim().split("="))
    .find(([name]) => name === "session")
    ?.slice(1)
    .join("=") ?? null;
}

function currentUser(cookieHeader: string | undefined): PublicUser | null {
  const token = readSessionToken(cookieHeader);
  if (!token) return null;
  const row = database.prepare(`
    SELECT users.id, users.email, users.email_verified_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.revoked_at IS NULL
      AND sessions.expires_at > ?
  `).get(hashToken(token), Date.now()) as SessionUserRow | undefined;
  return row
    ? { id: row.id, email: row.email, emailVerified: row.email_verified_at !== null }
    : null;
}

function revokeSession(cookieHeader: string | undefined): void {
  const token = readSessionToken(cookieHeader);
  if (!token) return;
  database.prepare(`
    UPDATE sessions
    SET revoked_at = ?
    WHERE token_hash = ? AND revoked_at IS NULL
  `).run(Date.now(), hashToken(token));
}

function sessionCookie(token: string): string {
  return `session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1_000}${cookieSecurity}`;
}

function clearSessionCookie(): string {
  return `session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${cookieSecurity}`;
}

export {
  clearSessionCookie,
  createSession,
  currentUser,
  revokeSession,
  sessionCookie,
};
