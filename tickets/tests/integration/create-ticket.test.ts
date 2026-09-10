/**
 * Integration-test mental model
 *
 * These tests behave like a real client: they start the Tickets HTTP server,
 * send requests through `fetch`, and then inspect the HTTP response, database,
 * and upload storage. That wider journey is why this is an integration test
 * rather than a unit test of one function.
 *
 * Each test follows the same three roles:
 * 1. Arrange — prepare identity and request data.
 * 2. Act — send the request.
 * 3. Assert — prove the observable HTTP and durable-storage results.
 */

// `assert` supplies comparison functions. A failed comparison fails the test.
import assert from "node:assert/strict";
// `test` defines a case; the three hooks prepare and clean its shared environment.
import { after, before, beforeEach, test } from "node:test";
import { database } from "../../src/database.js";
// `import type` is erased after TypeScript checks the file; no runtime import remains.
import type { Ticket } from "../../src/tickets/ticket.js";
import { issueAccessToken } from "../support/auth.js";
import { resetDatabase } from "../support/database.js";
import { startTestServer, type TestServer } from "../support/server.js";
// Upload helpers expose the real test directory so tests can inspect file side effects.
import {
  cleanupUploads,
  resetUploads,
  stagedUploads,
  storedImages,
} from "../support/uploads.js";

// A tiny valid PNG signature is enough for the image validator used by this suite.
const pngImage = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// This valid baseline fixture keeps each test focused on only the field it changes.
const defaultFields = {
  eventName: "The Example Tour",
  description: "One general-admission ticket",
  eventStartsAt: "2030-06-15T19:00:00.000Z",
  eventEndsAt: "2030-06-15T22:00:00.000Z",
  ticketInfo: "Section GA",
  place: "Example Arena",
  priceCents: "12500",
};

// `typeof defaultFields` derives a reusable type from the fixture above.
// `Partial<T>` makes every field optional, allowing one test to override only
// the value relevant to its scenario. The `?` on the other properties also
// means callers may omit them.

type TicketFields = typeof defaultFields;
type CreateTicketOptions = {
  token?: string;
  idempotencyKey?: string;
  fields?: Partial<TicketFields>;
  image?: Uint8Array;
  imageType?: string;
};

// This variable is assigned once by `before` and shared by all tests in this file.
let server: TestServer;

// `before` runs once before the first test. Starting one server keeps the suite fast.
before(async () => {
  server = await startTestServer();
});

// `after` runs once after the final test and releases process/filesystem resources.
after(async () => {
  await server.close();
  cleanupUploads();
});

// `beforeEach` runs before every test. Resetting durable state prevents one test
// from changing the result of another test.
beforeEach(() => {
  resetDatabase();
  resetUploads();
});

// This helper asks the real test database for observable evidence. The `as`
// assertion tells TypeScript the row shape returned by SQLite; it does not
// validate or change the value at runtime.
function ticketCount(): number {
  return (database.prepare("SELECT COUNT(*) AS count FROM tickets").get() as { count: number }).count;
}

/**
 * Builds the same multipart HTTP request a browser would send.
 *
 * `options = {}` lets callers omit the argument. Tests override only what they
 * need while the helper supplies one valid request by default.
 */
function createTicket(options: CreateTicketOptions = {}): Promise<Response> {
  // Object spread copies defaults first and overrides them with test-specific fields.
  const fields = { ...defaultFields, ...options.fields };
  const form = new FormData();
  // `FormData` creates multipart form fields; `Blob` below represents the uploaded file.
  // `Object.entries` produces `[name, value]` pairs for the multipart form.
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  // `??` uses the default only when the left side is null or undefined.
  const image = new Uint8Array(options.image ?? pngImage);
  form.set(
    "image",
    new Blob([image.buffer], { type: options.imageType ?? "image/png" }),
    "ticket.png",
  );

  // `Record<string, string>` means an object whose keys and values are strings.
  const headers: Record<string, string> = {
    "Idempotency-Key": options.idempotencyKey ?? "create-ticket-key",
  };
  // Authentication is optional so the first test can deliberately omit it.
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  // `fetch` is the Act step: it sends a real HTTP request to the test server.
  // Returning its Promise lets each test `await` the eventual Response.
  return fetch(`${server.origin}/tickets`, { method: "POST", headers, body: form });
}

/**
 * Contract: authentication is checked before an unauthenticated upload can
 * create either a database row or a file.
 */
test("POST /tickets requires authentication before accepting an upload", async () => {
  // Act: call the helper without a token.
  const response = await createTicket();

  // Assert: verify the public HTTP contract and both durable side-effect stores.
  // `equal` compares one primitive value; `deepEqual` compares object/array contents.
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.deepEqual(await response.json(), {
    error: "Authentication required",
    code: "authentication_required",
  });
  assert.equal(ticketCount(), 0);
  assert.deepEqual(storedImages(), []);
  assert.deepEqual(stagedUploads(), []);
});

/**
 * Contract: an authenticated request creates one owned Ticket, stores its image,
 * and serves that image through the URL returned by the API.
 */
test("POST /tickets creates an owned ticket and serves its image", async () => {
  // Arrange: destructuring extracts `token` and `user` from the issued identity.
  const { token, user } = issueAccessToken();
  const response = await createTicket({ token });
  // `await` pauses this async test until JSON parsing finishes. `as` describes
  // the expected TypeScript shape but does not perform runtime validation.
  const body = (await response.json()) as { ticket: Ticket };

  // Assert the HTTP representation created for the client.
  assert.equal(response.status, 201);
  assert.equal(body.ticket.eventName, defaultFields.eventName);
  assert.equal(body.ticket.eventStartsAt, defaultFields.eventStartsAt);
  assert.equal(body.ticket.eventEndsAt, defaultFields.eventEndsAt);
  assert.equal(body.ticket.priceCents, 12500);
  assert.equal(body.ticket.currency, "USD");
  assert.equal(body.ticket.status, "available");
  assert.equal(body.ticket.imageUrl, `/ticket-images/${body.ticket.id}.png`);

  // Inspect SQLite to prove durable persistence and ownership. The public
  // Ticket response intentionally omits ownerId, so ownership belongs in this check.
  const row = database
    .prepare("SELECT owner_id, image_filename, idempotency_key FROM tickets WHERE id = ?")
    .get(body.ticket.id) as {
    owner_id: string;
    image_filename: string;
    idempotency_key: string;
  };
  // Spreading the SQLite row creates a plain object for a clear deep comparison.
  assert.deepEqual({ ...row }, {
    owner_id: user.id,
    image_filename: `${body.ticket.id}.png`,
    idempotency_key: "create-ticket-key",
  });
  // The final staged-upload check proves temporary files were cleaned up.
  assert.deepEqual(storedImages(), [`${body.ticket.id}.png`]);
  assert.deepEqual(stagedUploads(), []);

  // Follow the returned URL to prove the stored bytes are actually retrievable.
  const imageResponse = await fetch(`${server.origin}${body.ticket.imageUrl}`);
  assert.equal(imageResponse.status, 200);
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), Buffer.from(pngImage));
});

/**
 * Contract: retrying the exact request with the same idempotency key returns the
 * original Ticket instead of creating a second business effect.
 */
test("POST /tickets replays the original ticket for an identical idempotent request", async () => {
  const { token } = issueAccessToken();
  // Arrange and Act: both calls use the helper's same default key and data.
  const firstResponse = await createTicket({ token });
  const firstBody = (await firstResponse.json()) as { ticket: Ticket };
  const replayResponse = await createTicket({ token });
  const replayBody = (await replayResponse.json()) as { ticket: Ticket };

  // The replay returns 200, the same Ticket, one database row, and one image.
  assert.equal(firstResponse.status, 201);
  assert.equal(replayResponse.status, 200);
  assert.deepEqual(replayBody.ticket, firstBody.ticket);
  assert.equal(ticketCount(), 1);
  assert.deepEqual(storedImages(), [`${firstBody.ticket.id}.png`]);
  assert.deepEqual(stagedUploads(), []);
});

/**
 * Contract: an idempotency key identifies one logical request. Reusing it with
 * different data is a conflict, not permission to create another Ticket.
 */
test("POST /tickets rejects different data using an existing idempotency key", async () => {
  const { token } = issueAccessToken();
  // First establish the successful result owned by the default idempotency key.
  const firstResponse = await createTicket({ token });
  const firstBody = (await firstResponse.json()) as { ticket: Ticket };
  // Then reuse that key while changing one fingerprinted request field.
  const conflictResponse = await createTicket({
    token,
    fields: { eventName: "A Different Event" },
  });

  // The original durable result must remain the only business effect.
  assert.equal(firstResponse.status, 201);
  assert.equal(conflictResponse.status, 409);
  assert.deepEqual(await conflictResponse.json(), {
    error: "Idempotency key was already used for different ticket data",
    code: "idempotency_conflict",
  });
  assert.equal(ticketCount(), 1);
  assert.deepEqual(storedImages(), [`${firstBody.ticket.id}.png`]);
  assert.deepEqual(stagedUploads(), []);
});

/**
 * Contract: unsupported content is rejected and every partial upload is removed,
 * leaving neither a Ticket row nor staged/stored image files.
 */
test("POST /tickets rejects an unsupported image and removes the staged upload", async () => {
  const { token } = issueAccessToken();
  // `TextEncoder` turns text into bytes so the request can pretend it is a file.
  const response = await createTicket({
    token,
    image: new TextEncoder().encode("not an image"),
    imageType: "text/plain",
  });

  // Assert the rejection plus complete rollback/cleanup of side effects.
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), {
    error: "Image must be JPEG, PNG, or WebP",
    code: "unsupported_image",
  });
  assert.equal(ticketCount(), 0);
  assert.deepEqual(storedImages(), []);
  assert.deepEqual(stagedUploads(), []);
});
