# Orders messaging

This folder is about **backend service-to-service messaging**. It is not buyer/seller chat, email, or browser notifications.

A message is a small record saying that something happened, for example: “Order 123 completed.” The service that owns the state makes the decision first. Other services can learn about that committed fact later by reading the message from a broker such as Redis Streams.

## HTTP request versus message

Use an immediate HTTP request when the caller needs an authoritative answer before it can continue. Winning a Ticket reservation and checking whether an Order may be paid are decisions, so they cannot rely on a delayed message.

Use a message after a decision has committed when another component can react asynchronously. The sender does not wait for every consumer to finish.

```text
Immediate decision:  caller -> HTTP -> owning service -> response
Committed fact:      owning service -> outbox -> Redis Streams -> consumers
```

## Why the outbox exists

Writing business state and publishing to Redis are two separate operations. A process can crash between them:

```text
Order committed -> process crashes -> event never published
```

The transactional outbox avoids that gap:

1. Change the Order and insert an `outbox_messages` row in the **same database transaction**.
2. Commit both together.
3. A publisher later reads unpublished rows and sends them to Redis Streams.
4. After a successful send, mark the row as published.
5. After a failed send, record the error and retry later.

A send can succeed just before the publisher crashes, leaving the row marked unpublished. Retrying can therefore publish the same message more than once. The outbox prevents lost committed facts; it does not promise exactly-once delivery.

## Why the inbox exists

Consumers must expect duplicate delivery. The inbox gives each consumer a durable idempotency key: `(consumer, messageId)`.

The intended consumer flow is:

1. Receive a message and begin a database transaction.
2. Call `recordInboxMessage(consumer, messageId)`.
3. If the result is `duplicate`, make no business change.
4. If the result is `recorded`, apply the business change.
5. Commit the inbox marker and business change together.
6. Acknowledge the Redis message only after the commit.

If the consumer crashes after committing but before acknowledging, Redis can redeliver the message and the inbox safely identifies it as a duplicate.

Recording the inbox marker separately from the business change is unsafe: a crash between those writes could make unprocessed work look complete.

## Files

- `outbox-message.ts` defines the application and database shapes of outgoing messages.
- `outbox-repo.ts` stores outgoing messages and tracks publication attempts.
- `inbox-message.ts` defines processed-message markers.
- `inbox-repo.ts` atomically inserts or detects a marker for one consumer.

## Field glossary

- `messageId` / outbox `id`: stable identity used to recognize the same message again.
- `consumer`: stable name of one message handler; different consumers may process the same message independently.
- `aggregateType` and `aggregateId`: business entity that produced the fact, such as an Order and its ID.
- `aggregateVersion`: entity version used to detect stale or out-of-order facts.
- `eventType`: kind of business fact. Concrete event names are defined elsewhere when contracts are accepted.
- `eventVersion`: version of the event contract, not the Order version.
- `payload`: event data serialized as JSON.
- `publishedAt`: local evidence that the publisher completed its send path.
- `attemptCount` and `lastError`: publication retry diagnostics.

## Current boundary

These files are persistence primitives only. No Redis publisher, Redis consumer, event contract, retry loop, or handler transaction is wired here yet. Callers must provide that orchestration. Redis remains transport; Orders remains authoritative for Order state and decisions.
