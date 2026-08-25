import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  clearRefreshTokenCookie,
  readRefreshToken,
  refreshTokenCookie,
} from "../../src/tokens/refresh-token-cookie.js";

test("reads a refresh token from a cookie header", () => {
  assert.equal(readRefreshToken("theme=dark; refreshToken=abc.def==; other=1"), "abc.def==");
});

test("returns null when the refresh-token cookie is absent", () => {
  assert.equal(readRefreshToken(undefined), null);
  assert.equal(readRefreshToken("refreshTokenish=nope; other=1"), null);
});

test("sets refresh-token cookie attributes", () => {
  assert.equal(
    refreshTokenCookie("opaque-token"),
    "refreshToken=opaque-token; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800",
  );
});

test("clears refresh-token cookie with the same browser-visible attributes", () => {
  assert.equal(
    clearRefreshTokenCookie(),
    "refreshToken=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0",
  );
});

test("adds Secure to refresh-token cookies in production", () => {
  const script = `
    const mod = await import("./dist-test/src/tokens/refresh-token-cookie.js");
    console.log(mod.refreshTokenCookie("token"));
    console.log(mod.clearRefreshTokenCookie());
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
      JWT_SECRET: process.env.JWT_SECRET ?? "x".repeat(32),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "refreshToken=token; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800; Secure",
    "refreshToken=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Secure",
  ]);
});
