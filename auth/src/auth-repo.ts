import { createHash, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { database } from "./database.js";
import type { ChallengePurpose } from "./email.js";

type Credentials = { email: string; password: string };
type EmailCode = { email: string; code: string };
type PublicUser = { id: string; email: string; emailVerified: boolean };
type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: number | null;
  failed_signin_attempts: number;
  signin_locked_until: number | null;
};
type ChallengeRow = {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: number;
  failed_attempts: number;
  email: string;
  email_verified_at: number | null;
};
type AuthenticationResult =
  | { status: "authenticated"; user: PublicUser }
  | { status: "invalid" }
  | { status: "locked" }
  | { status: "unverified" };

const scryptAsync = promisify(scrypt);
const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
const CHALLENGE_TTL_MS = 10 * 60 * 1_000;
const CHALLENGE_COOLDOWN_MS = 60 * 1_000;
const SIGNIN_LOCK_MS = 5 * 60 * 1_000;
const cookieSecurity = process.env.NODE_ENV === "production" ? "; Secure" : "";

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function readCredentials(body: unknown): Credentials | null {
  if (!body || typeof body !== "object") return null;
  const { email: rawEmail, password } = body as Record<string, unknown>;
  const email = normalizeEmail(rawEmail);
  if (!email || typeof password !== "string" || password.length < 8 || password.length > 256) return null;
  return { email, password };
}

function readEmail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  return normalizeEmail((body as Record<string, unknown>).email);
}

function readEmailCode(body: unknown): EmailCode | null {
  if (!body || typeof body !== "object") return null;
  const { email: rawEmail, code } = body as Record<string, unknown>;
  const email = normalizeEmail(rawEmail);
  return email && typeof code === "string" && /^\d{6}$/.test(code) ? { email, code } : null;
}

async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(secret, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

async function secretMatches(secret: string, secretHash: string): Promise<boolean> {
  const [salt, storedHash] = secretHash.split(":");
  if (!salt || !storedHash) return false;
  const stored = Buffer.from(storedHash, "hex");
  const supplied = (await scryptAsync(secret, salt, stored.length)) as Buffer;
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}

function publicUser(row: Pick<UserRow, "id" | "email" | "email_verified_at">): PublicUser {
  return { id: row.id, email: row.email, emailVerified: row.email_verified_at !== null };
}

function findUserByEmail(email: string): PublicUser | null {
  const row = database.prepare(
    "SELECT id, email, email_verified_at FROM users WHERE email = ?",
  ).get(email) as Pick<UserRow, "id" | "email" | "email_verified_at"> | undefined;
  return row ? publicUser(row) : null;
}

async function createUser(credentials: Credentials): Promise<PublicUser | null> {
  if (findUserByEmail(credentials.email)) return null;
  const now = Date.now();
  const user = {
    id: randomUUID(),
    email: credentials.email,
    passwordHash: await hashSecret(credentials.password),
  };

  try {
    database.prepare(`
      INSERT INTO users (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(user.id, user.email, user.passwordHash, now);
    return { id: user.id, email: user.email, emailVerified: false };
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: users.email")) return null;
    throw error;
  }
}

async function authenticateUser(credentials: Credentials): Promise<AuthenticationResult> {
  const row = database.prepare(`
    SELECT id, email, password_hash, email_verified_at, failed_signin_attempts, signin_locked_until
    FROM users
    WHERE email = ?
  `).get(credentials.email) as UserRow | undefined;

  if (!row) {
    await scryptAsync(credentials.password, "missing-user", 64);
    return { status: "invalid" };
  }

  const now = Date.now();
  if (row.signin_locked_until && row.signin_locked_until > now) {
    await secretMatches(credentials.password, row.password_hash);
    return { status: "locked" };
  }

  if (!(await secretMatches(credentials.password, row.password_hash))) {
    const attempts = row.failed_signin_attempts + 1;
    database.prepare(`
      UPDATE users
      SET failed_signin_attempts = ?,
          signin_locked_until = ?
      WHERE id = ?
    `).run(attempts, attempts >= 5 ? now + SIGNIN_LOCK_MS : null, row.id);
    return { status: "invalid" };
  }

  database.prepare(`
    UPDATE users
    SET failed_signin_attempts = 0, signin_locked_until = NULL
    WHERE id = ?
  `).run(row.id);

  if (row.email_verified_at === null) return { status: "unverified" };
  return { status: "authenticated", user: publicUser(row) };
}

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
    await scryptAsync(code, "missing-challenge", 64);
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
  `).get(hashToken(token), Date.now()) as Pick<UserRow, "id" | "email" | "email_verified_at"> | undefined;
  return row ? publicUser(row) : null;
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
  authenticateUser,
  clearSessionCookie,
  consumeChallenge,
  createSession,
  createUser,
  currentUser,
  findUserByEmail,
  issueChallenge,
  readCredentials,
  readEmail,
  readEmailCode,
  revokeSession,
  sessionCookie,
};
