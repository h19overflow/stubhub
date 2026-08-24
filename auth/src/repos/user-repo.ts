import { randomUUID } from "node:crypto";
import { database } from "../database.js";
import { dummySecretCheck, hashSecret, secretMatches } from "../secret.js";

type Credentials = { email: string; password: string };
type UserRole = "user" | "admin";
type PublicUser = { id: string; email: string; emailVerified: boolean; role: UserRole };
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

function findUserByEmail(email: string): PublicUser | null {
  const row = database.prepare(
    "SELECT id, email, email_verified_at, role FROM users WHERE email = ?",
  ).get(email) as
    | Pick<UserRow, "id" | "email" | "email_verified_at" | "role">
    | undefined;
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
    return { id: user.id, email: user.email, emailVerified: false, role: "user" };
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: users.email")) return null;
    throw error;
  }
}

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

export { authenticateUser, createUser, findUserByEmail };
export type { PublicUser };
