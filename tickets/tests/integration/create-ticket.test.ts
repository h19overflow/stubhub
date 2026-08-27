import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { database } from "../../src/database.js";
import type { Ticket } from "../../src/tickets/ticket.js";
import { issueAccessToken } from "../support/auth.js";
import { resetDatabase } from "../support/database.js";
import { startTestServer, type TestServer } from "../support/server.js";
import {
  cleanupUploads,
  resetUploads,
  stagedUploads,
  storedImages,
} from "../support/uploads.js";

const pngImage = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const defaultFields = {
  eventName: "The Example Tour",
  description: "One general-admission ticket",
  eventStartsAt: "2030-06-15T19:00:00.000Z",
  eventEndsAt: "2030-06-15T22:00:00.000Z",
  ticketInfo: "Section GA",
  place: "Example Arena",
  priceCents: "12500",
};

type TicketFields = typeof defaultFields;
type CreateTicketOptions = {
  token?: string;
  idempotencyKey?: string;
  fields?: Partial<TicketFields>;
  image?: Uint8Array;
  imageType?: string;
};

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
  cleanupUploads();
});

beforeEach(() => {
  resetDatabase();
  resetUploads();
});

function ticketCount(): number {
  return (database.prepare("SELECT COUNT(*) AS count FROM tickets").get() as { count: number }).count;
}

function createTicket(options: CreateTicketOptions = {}): Promise<Response> {
  const fields = { ...defaultFields, ...options.fields };
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  const image = new Uint8Array(options.image ?? pngImage);
  form.set(
    "image",
    new Blob([image.buffer], { type: options.imageType ?? "image/png" }),
    "ticket.png",
  );

  const headers: Record<string, string> = {
    "Idempotency-Key": options.idempotencyKey ?? "create-ticket-key",
  };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  return fetch(`${server.origin}/tickets`, { method: "POST", headers, body: form });
}

test("POST /tickets requires authentication before accepting an upload", async () => {
  const response = await createTicket();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.deepEqual(await response.json(), { error: "Authentication required" });
  assert.equal(ticketCount(), 0);
  assert.deepEqual(storedImages(), []);
  assert.deepEqual(stagedUploads(), []);
});

test("POST /tickets creates an owned ticket and serves its image", async () => {
  const { token, user } = issueAccessToken();
  const response = await createTicket({ token });
  const body = (await response.json()) as { ticket: Ticket };

  assert.equal(response.status, 201);
  assert.equal(body.ticket.ownerId, user.id);
  assert.equal(body.ticket.eventName, defaultFields.eventName);
  assert.equal(body.ticket.eventStartsAt, defaultFields.eventStartsAt);
  assert.equal(body.ticket.eventEndsAt, defaultFields.eventEndsAt);
  assert.equal(body.ticket.priceCents, 12500);
  assert.equal(body.ticket.currency, "USD");
  assert.equal(body.ticket.status, "available");
  assert.equal(body.ticket.imageUrl, `/ticket-images/${body.ticket.id}.png`);

  const row = database
    .prepare("SELECT owner_id, image_filename, idempotency_key FROM tickets WHERE id = ?")
    .get(body.ticket.id) as {
    owner_id: string;
    image_filename: string;
    idempotency_key: string;
  };
  assert.deepEqual({ ...row }, {
    owner_id: user.id,
    image_filename: `${body.ticket.id}.png`,
    idempotency_key: "create-ticket-key",
  });
  assert.deepEqual(storedImages(), [`${body.ticket.id}.png`]);
  assert.deepEqual(stagedUploads(), []);

  const imageResponse = await fetch(`${server.origin}${body.ticket.imageUrl}`);
  assert.equal(imageResponse.status, 200);
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), Buffer.from(pngImage));
});

test("POST /tickets replays the original ticket for an identical idempotent request", async () => {
  const { token } = issueAccessToken();
  const firstResponse = await createTicket({ token });
  const firstBody = (await firstResponse.json()) as { ticket: Ticket };
  const replayResponse = await createTicket({ token });
  const replayBody = (await replayResponse.json()) as { ticket: Ticket };

  assert.equal(firstResponse.status, 201);
  assert.equal(replayResponse.status, 200);
  assert.deepEqual(replayBody.ticket, firstBody.ticket);
  assert.equal(ticketCount(), 1);
  assert.deepEqual(storedImages(), [`${firstBody.ticket.id}.png`]);
  assert.deepEqual(stagedUploads(), []);
});

test("POST /tickets rejects different data using an existing idempotency key", async () => {
  const { token } = issueAccessToken();
  const firstResponse = await createTicket({ token });
  const firstBody = (await firstResponse.json()) as { ticket: Ticket };
  const conflictResponse = await createTicket({
    token,
    fields: { eventName: "A Different Event" },
  });

  assert.equal(firstResponse.status, 201);
  assert.equal(conflictResponse.status, 409);
  assert.deepEqual(await conflictResponse.json(), {
    error: "Idempotency key was already used for different ticket data",
  });
  assert.equal(ticketCount(), 1);
  assert.deepEqual(storedImages(), [`${firstBody.ticket.id}.png`]);
  assert.deepEqual(stagedUploads(), []);
});

test("POST /tickets rejects an unsupported image and removes the staged upload", async () => {
  const { token } = issueAccessToken();
  const response = await createTicket({
    token,
    image: new TextEncoder().encode("not an image"),
    imageType: "text/plain",
  });

  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { error: "Image must be JPEG, PNG, or WebP" });
  assert.equal(ticketCount(), 0);
  assert.deepEqual(storedImages(), []);
  assert.deepEqual(stagedUploads(), []);
});
