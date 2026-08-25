import { randomUUID } from "node:crypto";
import { database } from "../../src/database.js";
import { hashSecret } from "../../src/security/secret.js";
import type { ChallengePurpose } from "../../src/challenges/challenge.js";
import type { PublicUser, UserRole } from "../../src/users/user.js";

type SeedUserOptions = {
  id?: string;
  email?: string;
  password?: string;
  emailVerified?: boolean;
  role?: UserRole;
  failedSigninAttempts?: number;
  signinLockedUntil?: number | null;
};

type SeedChallengeOptions = {
  userId: string;
  purpose: ChallengePurpose;
  code?: string;
  expiresAt?: number;
  failedAttempts?: number;
  usedAt?: number | null;
  createdAt?: number;
};

function resetDatabase(): void {
  database.prepare("DELETE FROM refresh_tokens").run();
  database.prepare("DELETE FROM email_challenges").run();
  database.prepare("DELETE FROM users").run();
}

async function seedUser(options: SeedUserOptions = {}): Promise<{ user: PublicUser; password: string }> {
  const now = Date.now();
  const id = options.id ?? randomUUID();
  const email = options.email ?? `${id}@identity.test`;
  const password = options.password ?? "correct horse battery staple";
  const role = options.role ?? "user";
  const emailVerifiedAt = options.emailVerified === false ? null : now;

  database.prepare(`
    INSERT INTO users (
      id,
      email,
      password_hash,
      email_verified_at,
      role,
      failed_signin_attempts,
      signin_locked_until,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    email,
    await hashSecret(password),
    emailVerifiedAt,
    role,
    options.failedSigninAttempts ?? 0,
    options.signinLockedUntil ?? null,
    now,
  );

  return {
    user: { id, email, emailVerified: emailVerifiedAt !== null, role },
    password,
  };
}

async function seedChallenge(options: SeedChallengeOptions): Promise<{ code: string }> {
  const now = Date.now();
  const code = options.code ?? "123456";

  database.prepare(`
    INSERT INTO email_challenges (
      id,
      user_id,
      purpose,
      code_hash,
      expires_at,
      used_at,
      failed_attempts,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    options.userId,
    options.purpose,
    await hashSecret(code),
    options.expiresAt ?? now + 10 * 60 * 1_000,
    options.usedAt ?? null,
    options.failedAttempts ?? 0,
    options.createdAt ?? now,
  );

  return { code };
}

export { resetDatabase, seedChallenge, seedUser };
