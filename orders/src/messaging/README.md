# Orders messaging

Orders atomically inserts `order.completed` or `order.expired` into
`order_event_publications` with the terminal Order transition. The durable event
publication ledger (outbox pattern) scans at startup and on an interval, appends
the exact event envelope to Redis Stream `orders.events` in field `event`, then
records publication progress. A crash after append but before progress is
recorded may publish the same stable `messageId` again.

- `order-event-publication.ts` defines the durable event publication shape.
- `order-event-publication-repo.ts` reads due publications and records attempts.

Redis is transport only. Orders state and the event publication ledger commit are
authoritative.
