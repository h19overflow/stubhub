import { randomUUID } from "node:crypto";
import { database } from "../database.js";
import { dummySecretCheck, hashSecret, secretMatches } from "../security/secret.js";
import type { PublicUser, UserRole } from "./user.js";

type Credentials = { email: string; password: string };
type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: number | null;
  role: UserRole;
  failed_signin_attempts: number;
  signin_locked_until: number | null;
};
type AuthenticationResult =
  | { status: "authenticated"; user: PublicUser }
  | { status: "invalid" }
  | { status: "locked" }
  | { status: "unverified" };

const SIGNIN_LOCK_MS = 5 * 60 * 1_000;

/**
 * Projects a UserRow to the public contract (strips password hash and internal counters).
 *
 * Flow: every read path (findUserByEmail, createUser, authenticateUser) maps
 * through this so hashes never leak to HTTP responses. Derives emailVerified
 * from email_verified_at presence.
 */
function publicUser(
  row: Pick<UserRow, "id" | "email" | "email_verified_at" | "role">,
): PublicUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified_at !== null,
    role: row.role,
  };
}

/**
 * Looks up a user by email for display or existence checks.
 *
 * Flow: signup checks this before insert to give early null; callers use the
 * returned PublicUser for challenge issuance. Returns null if not found.
 * Single-row SELECT on the unique email index.
 */
function findUserByEmail(email: string): PublicUser | null {
  const row = database.prepare(
    "SELECT id, email, email_verified_at, role FROM users WHERE email = ?",
  ).get(email) as
    | Pick<UserRow, "id" | "email" | "email_verified_at" | "role">
    | undefined;
  return row ? publicUser(row) : null;
}

/**
 * Looks up one user by its stable identifier.
 *
 * Flow: internal Identity lookup validates the path UUID, then calls this
 * single-row query. Returns null for a missing identifier and never lists users.
 */
function findUserById(userId: string): PublicUser | null {
  const row = database.prepare(
    "SELECT id, email, email_verified_at, role FROM users WHERE id = ?",
  ).get(userId) as
    | Pick<UserRow, "id" | "email" | "email_verified_at" | "role">
    | undefined;
  return row ? publicUser(row) : null;
}

/**
 * Elevates one existing account to the fixed administrator role.
 *
 * Flow: exact normalized email lookup → guarded role update → return the
 * public user. Missing accounts return null; admin replays update the same
 * row and return the same representation.
 */
function elevateUserByEmail(email: string): PublicUser | null {
  const user = findUserByEmail(email);
  if (!user) return null;

  database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
  return { ...user, role: "admin" };
}

/**
 * Creates a new Identity user with scrypt-hashed password.
 *
 * Flow: signup route -> validates input -> calls this. Re-checks email via
 * findUserByEmail, hashes password, INSERTs with randomUUID. Handles race via
 * UNIQUE constraint catch (returns null -> route returns 409). Returns
 * PublicUser on success. emailVerified flag controls whether email_verified_at
 * is set immediately (used by tests/seeds).
 */
async function createUser(
  credentials: Credentials,
  emailVerified = false,
): Promise<PublicUser | null> {
  if (findUserByEmail(credentials.email)) return null;
  const now = Date.now();
  const user = {
    id: randomUUID(),
    email: credentials.email,
    passwordHash: await hashSecret(credentials.password),
    emailVerified,
  };

  try {
    database.prepare(`
      INSERT INTO users (id, email, password_hash, email_verified_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(user.id, user.email, user.passwordHash, emailVerified ? now : null, now);
    return { id: user.id, email: user.email, emailVerified, role: "user" };
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: users.email")) return null;
    throw error;
  }
}

/**
 * Authenticates a credentials pair with lockout and dummy-timing protection.
 *
 * Flow: signin route -> calls this. Steps: SELECT by email -> if missing runs
 * dummySecretCheck to equalize timing -> if locked (signin_locked_until>now)
 * still runs secretMatches then returns locked -> on password mismatch
 * increments failed_signin_attempts and sets 5-min lock after 5 failures ->
 * on success resets counters -> if email not verified returns unverified ->
 * else returns authenticated with PublicUser. Updates are immediate writes.
 */
async function authenticateUser(credentials: Credentials): Promise<AuthenticationResult> {
  const row = database.prepare(`
    SELECT
      id, email, password_hash, email_verified_at, role,
      failed_signin_attempts, signin_locked_until
    FROM users
    WHERE email = ?
  `).get(credentials.email) as UserRow | undefined;

  if (!row) {
    await dummySecretCheck(credentials.password, "missing-user");
    return { status: "invalid" };
  }

  const now = Date.now();
  if (row.signin_locked_until && row.signin_locked_until > now) {
    await secretMatches(credentials.password, row.password_hash);
    return { status: "locked" };
  }

  if (!(await secretMatches(credentials.password, row.password_hash))) {
    database.prepare(`
      UPDATE users
      SET failed_signin_attempts = failed_signin_attempts + 1,
          signin_locked_until = CASE
            WHEN failed_signin_attempts + 1 >= 5 THEN ?
            ELSE NULL
          END
      WHERE id = ?
    `).run(now + SIGNIN_LOCK_MS, row.id);
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

export { authenticateUser, createUser, elevateUserByEmail, findUserByEmail, findUserById };
