import assert from "node:assert/strict";
import { test } from "node:test";
import {
  credentialsSchema,
  emailCodeSchema,
  emailSchema,
} from "../../src/http/schemas.js";

test("normalizes email input before validation", () => {
  assert.deepEqual(emailSchema.parse({ email: "  TEST@Example.COM  " }), {
    email: "test@example.com",
  });
});

test("accepts password boundary lengths", () => {
  assert.equal(credentialsSchema.safeParse({ email: "a@example.com", password: "x".repeat(8) }).success, true);
  assert.equal(credentialsSchema.safeParse({ email: "a@example.com", password: "x".repeat(256) }).success, true);
});

test("rejects passwords outside the supported length range", () => {
  assert.equal(credentialsSchema.safeParse({ email: "a@example.com", password: "x".repeat(7) }).success, false);
  assert.equal(credentialsSchema.safeParse({ email: "a@example.com", password: "x".repeat(257) }).success, false);
});

test("accepts only six-digit email codes", () => {
  assert.equal(emailCodeSchema.safeParse({ email: "a@example.com", code: "123456" }).success, true);
  assert.equal(emailCodeSchema.safeParse({ email: "a@example.com", code: "12345" }).success, false);
  assert.equal(emailCodeSchema.safeParse({ email: "a@example.com", code: "1234567" }).success, false);
  assert.equal(emailCodeSchema.safeParse({ email: "a@example.com", code: "abcdef" }).success, false);
});
