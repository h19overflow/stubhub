import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { startTestServer, type TestServer } from "../support/server.js";
import { startFakeTicketsServer, type FakeTicketsServer } from "../support/fake-tickets-server.js";
import { issueAccessToken } from "../support/auth.js";

let ordersServer: TestServer;
let ticketsServer: FakeTicketsServer;

before(async () => {
  ticketsServer = await startFakeTicketsServer();
  process.env.TICKETS_SERVICE_URL = ticketsServer.origin;
  ordersServer = await startTestServer();
});

after(async () => {
  await ordersServer?.close();
  await ticketsServer?.close();
});

test("POST /orders requires authentication", async () => {
  const response = await fetch(`${ordersServer.origin}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "test-key-1",
    },
    body: JSON.stringify({ ticketId: randomUUID() }),
  });

  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: string; code: string };
  assert.equal(body.error, "Authentication required");
  assert.equal(body.code, "authentication_required");
});

test("POST /orders successfully creates an order when reservation succeeds", async () => {
  const { token } = issueAccessToken();
  const ticketId = randomUUID();
  const idempotencyKey = `create-order-${randomUUID()}`;

  ticketsServer.setState({ outcome: "reserved", priceCents: 15000 });

  const response = await fetch(`${ordersServer.origin}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ ticketId }),
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as { outcome: string; order: { id: string; ticketId: string; amountCents: number; status: string } };

  assert.equal(body.outcome, "created");
  assert.equal(body.order.ticketId, ticketId);
  assert.equal(body.order.amountCents, 15000);
  assert.equal(body.order.status, "pending");

  // Replaying with identical idempotency key returns 200 replayed
  const replayResponse = await fetch(`${ordersServer.origin}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ ticketId }),
  });

  assert.equal(replayResponse.status, 200);
  const replayBody = (await replayResponse.json()) as { outcome: string; order: { id: string } };
  assert.equal(replayBody.outcome, "replayed");
  assert.equal(replayBody.order.id, body.order.id);
});

test("POST /orders rejects idempotency key reuse with different ticket data", async () => {
  const { token } = issueAccessToken();
  const idempotencyKey = `conflict-key-${randomUUID()}`;
  const firstTicketId = randomUUID();
  const secondTicketId = randomUUID();

  ticketsServer.setState({ outcome: "reserved" });

  const firstResponse = await fetch(`${ordersServer.origin}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ ticketId: firstTicketId }),
  });
  assert.equal(firstResponse.status, 201);

  // Reuse same idempotency key with second ticket
  const conflictResponse = await fetch(`${ordersServer.origin}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ ticketId: secondTicketId }),
  });

  assert.equal(conflictResponse.status, 409);
  const conflictBody = (await conflictResponse.json()) as { error: string; code: string };
  assert.equal(conflictBody.code, "idempotency_conflict");
});

test("POST /orders handles ticket unavailable from Tickets service", async () => {
  const { token } = issueAccessToken();
  const ticketId = randomUUID();
  const idempotencyKey = `unavail-key-${randomUUID()}`;

  ticketsServer.setState({ outcome: "unavailable" });

  const response = await fetch(`${ordersServer.origin}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ ticketId }),
  });

  assert.equal(response.status, 409);
  const body = (await response.json()) as { error: string; code: string };
  assert.equal(body.code, "ticket_unavailable");
});

test("GET /orders/mine lists user orders", async () => {
  const { token } = issueAccessToken();
  const ticketId = randomUUID();

  ticketsServer.setState({ outcome: "reserved" });

  await fetch(`${ordersServer.origin}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": `list-key-${randomUUID()}`,
    },
    body: JSON.stringify({ ticketId }),
  });

  const listResponse = await fetch(`${ordersServer.origin}/orders/mine`, {
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(listResponse.status, 200);
  const listBody = (await listResponse.json()) as { orders: Array<{ ticketId: string }> };
  assert.ok(Array.isArray(listBody.orders));
  assert.ok(listBody.orders.length >= 1);
  assert.equal(listBody.orders[0].ticketId, ticketId);
});
