# Orders messaging

Orders atomically inserts `order.completed` or `order.expired` into `outbox_messages` with the terminal Order transition. The durable publisher scans at startup and on an interval, appends the exact event envelope to Redis Stream `orders.events` in field `event`, then records publication progress. A crash after append but before progress is recorded may publish the same stable `messageId` again.

- `outbox-message.ts` defines the durable outgoing message shape.
- `outbox-repo.ts` reads unpublished messages and records publish attempts.

Redis is transport only. Orders state and the outbox commit are authoritative.
