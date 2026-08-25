import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { database } from "../../src/database.js";
import { createAuthentication } from "../../src/tokens/authentication.js";
import { resetDatabase, seedUser } from "../support/database.js";
import { readRefreshTokenCookie } from "../support/cookie.js";
import { startTestServer, type TestServer } from "../support/server.js";

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

beforeEach(() => {
  resetDatabase();
});

after(async () => {
  await server.close();
});

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function refresh(cookie?: string): Promise<Response> {
  return fetch(`${server.origin}/refresh`, {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
  });
}

async function issueRefreshToken() {
  const { user } = await seedUser({ emailVerified: true });
  const authentication = await createAuthentication(user);
  return { user, ...authentication };
}

test("POST /refresh rejects a missing token and clears the cookie", async () => {
  const response = await refresh();

  assert.equal(response.status, 401);
  assert.match(response.headers.get("set-cookie") ?? "", /refreshToken=;.*Max-Age=0/);
  assert.deepEqual(await response.json(), { error: "Invalid or expired refresh token" });
});

test("POST /refresh rejects an unknown token and clears the cookie", async () => {
  const response = await refresh("refreshToken=unknown");

  assert.equal(response.status, 401);
  assert.match(response.headers.get("set-cookie") ?? "", /refreshToken=;.*Max-Age=0/);
});

test("POST /refresh rejects an expired token and clears the cookie", async () => {
  const { refreshToken } = await issueRefreshToken();
  database.prepare("UPDATE refresh_tokens SET expires_at = ? WHERE token_hash = ?").run(Date.now() - 1, hash(refreshToken));

  const response = await refresh(`refreshToken=${refreshToken}`);

  assert.equal(response.status, 401);
  assert.match(response.headers.get("set-cookie") ?? "", /refreshToken=;.*Max-Age=0/);
});

test("POST /refresh rotates the token and rejects the old token", async () => {
  const { user, refreshToken } = await issueRefreshToken();

  const rotated = await refresh(`refreshToken=${refreshToken}`);
  const nextToken = readRefreshTokenCookie(rotated.headers.get("set-cookie"));

  assert.equal(rotated.status, 200);
  assert.notEqual(nextToken, refreshToken);
  assert.deepEqual((await rotated.json()).user, user);
  assert.equal(
    (database.prepare("SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?").get(hash(refreshToken)) as { revoked_at: number | null }).revoked_at !== null,
    true,
  );

  const reused = await refresh(`refreshToken=${refreshToken}`);
  assert.equal(reused.status, 401);
  assert.match(reused.headers.get("set-cookie") ?? "", /refreshToken=;.*Max-Age=0/);
});

test("POST /refresh revokes the family on replay and rejects the replacement", async () => {
  const { refreshToken } = await issueRefreshToken();
  const first = await refresh(`refreshToken=${refreshToken}`);
  const replacement = readRefreshTokenCookie(first.headers.get("set-cookie"));

  const replay = await refresh(`refreshToken=${refreshToken}`);
  const afterReplay = await refresh(`refreshToken=${replacement}`);

  assert.equal(first.status, 200);
  assert.equal(replay.status, 401);
  assert.equal(afterReplay.status, 401);
  const rows = database.prepare(`
    SELECT revoked_at
    FROM refresh_tokens
    WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = ?)
  `).all(hash(refreshToken)) as { revoked_at: number | null }[];
  assert.ok(rows.length >= 2);
  assert.equal(rows.every((row) => row.revoked_at !== null), true);
});

test("POST /refresh allows only one simultaneous rotation of a token", async () => {
  const { refreshToken } = await issueRefreshToken();

  const results = await Promise.all([
    refresh(`refreshToken=${refreshToken}`),
    refresh(`refreshToken=${refreshToken}`),
  ]);
  const statuses = results.map((response) => response.status).sort();

  assert.deepEqual(statuses, [200, 401]);
  const replacement = readRefreshTokenCookie(
    results.find((response) => response.status === 200)?.headers.get("set-cookie") ?? null,
  );
  const rejected = await refresh(`refreshToken=${replacement}`);
  assert.equal(rejected.status, 401);
});
