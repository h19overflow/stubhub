import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const startupScript = fileURLToPath(new URL("../../src/index.js", import.meta.url));
const secretError = "JWT_SECRET must contain at least 32 bytes";

function startupWith(jwtSecret?: string) {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PORT: "0",
    IDENTITY_DB_PATH: ":memory:",
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
  };
  if (jwtSecret !== undefined) env.JWT_SECRET = jwtSecret;

  return spawnSync(process.execPath, [startupScript], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env,
    encoding: "utf8",
    timeout: 5_000,
  });
}

test("startup fails when JWT_SECRET is missing", () => {
  const result = startupWith();

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, new RegExp(secretError));
});

test("startup fails when JWT_SECRET is shorter than 32 bytes", () => {
  const result = startupWith("short-test-secret");

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, new RegExp(secretError));
});
