import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/**
 * Hashes a password or email code with scrypt + random 16-byte salt.
 *
 * Flow: signup → `createUser` hashes password before INSERT; `issueChallenge`
 * hashes the 6-digit code before storing. Output format `salt:hexHash` is
 * what `secretMatches` expects. Uses scrypt(64-byte key) for slow hashing.
 */
async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(secret, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

/**
 * Timing-safe check that a supplied secret matches a stored `salt:hash`.
 *
 * Flow: `authenticateUser` checks password; `consumeChallenge` checks email
 * code. Uses `timingSafeEqual` so mismatch duration doesn't leak which byte
 * differed. Returns false for malformed hashes rather than throwing.
 */
async function secretMatches(secret: string, secretHash: string): Promise<boolean> {
  const [salt, storedHash] = secretHash.split(":");
  if (!salt || !storedHash) return false;
  const stored = Buffer.from(storedHash, "hex");
  const supplied = (await scryptAsync(secret, salt, stored.length)) as Buffer;
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}

/**
 * Constant-time dummy hash to equalize timing when a user/challenge is missing.
 *
 * Flow: `authenticateUser` and `consumeChallenge` call this when no row is
 * found, so an attacker can't infer existence from response time (otherwise
 * missing-user path would be instant vs. scrypt on hit). Value is discarded.
 */
async function dummySecretCheck(secret: string, salt: string): Promise<void> {
  await scryptAsync(secret, salt, 64);
}

export { dummySecretCheck, hashSecret, secretMatches };
