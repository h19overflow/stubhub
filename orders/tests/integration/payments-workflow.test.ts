import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { startTestServer, type TestServer } from "../support/server.js";
import { startFakeTicketsServer, type FakeTicketsServer } from "../support/fake-tickets-server.js";
import { issueAccessToken } from "../support/auth.js";
import { database } from "../../src/database.js";

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

test("POST /orders/:id/payments completes a pending order and enqueues order:completed outbox fact", async () => {
  const { token } = issueAccessToken();
  const ticketId = randomUUID();
  const orderKey = `order-for-pay-${randomUUID()}`;

  ticketsServer.setState({ outcome: "reserved", priceCents: 20000 });

  // 1. Create a pending order
  const orderRes = await fetch(`${ordersServer.origin}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": orderKey,
    },
    body: JSON.stringify({ ticketId }),
  });
  assert.equal(orderRes.status, 201);
  const orderBody = (await orderRes.json()) as { order: { id: string; status: string; amountCents: number } };
  const orderId = orderBody.order.id;
  assert.equal(orderBody.order.status, "pending");

  // 2. Submit payment
  const paymentKey = `pay-${randomUUID()}`;
  const payRes = await fetch(`${ordersServer.origin}/orders/${orderId}/payments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": paymentKey,
    },
    body: JSON.stringify({ paymentMethodToken: "local.success" }),
  });

  assert.equal(payRes.status, 200);
  const payBody = (await payRes.json()) as { outcome: string; order: { id: string; status: string }; paymentAttempt: { id: string } };
  assert.equal(payBody.outcome, "succeeded");
  assert.equal(payBody.order.status, "complete");

  // 3. Inspect database: order must be complete
  const orderRow = database
    .prepare("SELECT status FROM orders WHERE id = ?")
    .get(orderId) as { status: string };
  assert.equal(orderRow.status, "complete");

  // 4. Inspect outbox: order:completed event must be staged
  const outboxRow = database
    .prepare("SELECT event_type, published_at FROM order_event_publications WHERE aggregate_id = ? AND event_type = 'order.completed'")
    .get(orderId) as { event_type: string; published_at: number | null };
  assert.ok(outboxRow, "Outbox must have staged order:completed fact");
  assert.equal(outboxRow.published_at, null, "Outbox event is staged for asynchronous dispatch");

  // 5. Replay payment with same idempotency key
  const replayPayRes = await fetch(`${ordersServer.origin}/orders/${orderId}/payments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": paymentKey,
    },
    body: JSON.stringify({ paymentMethodToken: "local.success" }),
  });
  assert.equal(replayPayRes.status, 200);
  const replayBody = (await replayPayRes.json()) as { outcome: string; paymentAttempt: { id: string } };
  assert.equal(replayBody.outcome, "succeeded");
  assert.equal(replayBody.paymentAttempt.id, payBody.paymentAttempt.id);
});

test("POST /orders/:id/payments rejects payment when order is not payable", async () => {
  const { token } = issueAccessToken();
  const nonExistentOrderId = randomUUID();

  const response = await fetch(`${ordersServer.origin}/orders/${nonExistentOrderId}/payments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": `pay-missing-${randomUUID()}`,
    },
    body: JSON.stringify({ paymentMethodToken: "local.success" }),
  });

  assert.equal(response.status, 404);
  const body = (await response.json()) as { error: string; code: string };
  assert.equal(body.code, "order_not_found");
});
