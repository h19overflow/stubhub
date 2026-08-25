import assert from "node:assert/strict";
import { test } from "node:test";
import { hashSecret, secretMatches } from "../../src/security/secret.js";

test("hashSecret salts identical secrets differently", async () => {
  const first = await hashSecret("correct horse battery staple");
  const second = await hashSecret("correct horse battery staple");

  assert.notEqual(first, second);
  assert.match(first, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.match(second, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
});

test("secretMatches accepts the original secret and rejects a different secret", async () => {
  const hash = await hashSecret("email-code-123456");

  assert.equal(await secretMatches("email-code-123456", hash), true);
  assert.equal(await secretMatches("email-code-654321", hash), false);
});

test("secretMatches rejects malformed hashes", async () => {
  assert.equal(await secretMatches("secret", ""), false);
  assert.equal(await secretMatches("secret", "missing-separator"), false);
  assert.equal(await secretMatches("secret", ":abc"), false);
  assert.equal(await secretMatches("secret", "abc:"), false);
});
