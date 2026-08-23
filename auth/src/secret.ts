import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

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

async function dummySecretCheck(secret: string, salt: string): Promise<void> {
  await scryptAsync(secret, salt, 64);
}

export { dummySecretCheck, hashSecret, secretMatches };
