import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { resetDatabase } from "../support/database.js";
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

function signupAttempt(): Promise<Response> {
  return fetch(`${server.origin}/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

test("auth route rate limiting returns 429 and Retry-After on the 16th same-route request", async () => {
  const firstFifteen = await Promise.all(Array.from({ length: 15 }, signupAttempt));
  const limited = await signupAttempt();

  assert.equal(firstFifteen.every((response) => response.status !== 429), true);
  assert.equal(limited.status, 429);
  assert.match(limited.headers.get("retry-after") ?? "", /^\d+$/);
  assert.deepEqual(await limited.json(), { error: "Too many requests. Try again later" });
});
