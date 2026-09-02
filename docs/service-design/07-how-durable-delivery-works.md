# 7. How Durable Delivery Works — From Course ACKs to Redis Recovery

## Goal

Understand the reliability mechanics behind course lectures **325–349** and
**378–431** using the repository’s actual Redis Streams and SQLite code.

You should finish this lesson able to predict recovery at every crash point,
not merely repeat “at-least-once delivery.”

## Course bridge

| Course block | What to retain | Direct repository translation |
|---|---|---|
| 325–327 | Publication is asynchronous and must complete safely | Orders publishes from a durable publication ledger |
| 331–343 | Publish business changes and handle failures | `XADD`, retry scheduling, and unchanged durable rows on failure |
| 378–383 | Orders emits facts | Only accepted terminal facts are emitted: `order.completed` and `order.expired` |
| 385–393 | Consumers process and ACK messages | Tickets reads a Redis consumer group and calls `XACK` after commit |
| 394–415 | Concurrency, versions, listener tests, old messages | SQLite guards, stable identity, aggregate versions, and explicit current-state checks |
| 418–431 | Tickets listeners, locking, cancellation, edit rejection | Tickets owns guarded reserve/release/sold transitions; expiration replaces cancellation semantics |

The exact lecture treatment remains in
[`async-systems/lecture-map-314-450.md`](async-systems/lecture-map-314-450.md).

## Unconditional truths

1. A local database transaction cannot atomically commit to Redis.
2. A process can stop after either side has committed.
3. A response can be lost even when the operation succeeded.
4. Therefore a retry may repeat work whose outcome is already durable.
5. Safe retries require stable identity plus an atomic duplicate guard.

Everything in this lesson follows from those five facts.

## The four durable stages

The image shows the same producer-to-consumer relay that the course develops
through publishers, listeners, ACKs, and versioning.

![Four-stage durable message delivery relay](assets/durable-delivery-relay.png)

### Stage 1: commit business state and publication work together

Orders commits two records in one SQLite transaction:

- the authoritative Order transition; and
- an Order event publication row carrying a stable `messageId`.

Either both commit or neither commits. The industry name is the **transactional
outbox pattern**. In this repository, use the descriptive name **Orders event
publication ledger** so you remember what the row does.

This closes the first dangerous window:

```text
wrong: commit Order -> process dies -> no durable knowledge that Redis work exists
right: commit Order + publication row in one transaction
```

### Stage 2: relay the durable row to Redis

The Orders worker:

1. queries due unpublished rows;
2. appends the stored envelope with `XADD`;
3. waits for Redis success; and
4. marks the row published.

This order matters. Marking first could permanently lose the event. Appending
first can create a duplicate after a crash, but duplicates can be handled.
Permanent loss cannot be repaired without evidence.

### Stage 3: commit the consumer effect and receipt together

Tickets handles one validated Order event in a SQLite transaction:

- look for `(consumer_name, messageId)` in `processed_order_events`;
- if absent, check the current Ticket state and matching `lockedByOrderId`;
- apply the allowed transition;
- insert the processed-event receipt; and
- commit.

The industry name is the **inbox pattern**. Here, call it the **Tickets
processed-event ledger**. The receipt and business mutation must be atomic.
Otherwise a crash could record one without the other.

### Stage 4: acknowledge only after the consumer commit

Only after Stage 3 commits does Tickets call `XACK`.

`XACK` means:

> This consumer group has durably handled this Redis entry.

It does not mean:

- the stream entry was deleted;
- every consumer group handled it;
- Orders received confirmation; or
- the broker created exactly-once business behavior.

## The two crash windows you must derive

### Producer window

```text
XADD succeeds -> Orders crashes -> published_at was not stored
```

After restart, the publication row is still due. Orders appends it again. Redis
creates a new stream entry ID, but the envelope retains the same application
`messageId`.

Conclusion: producer retry creates **at-least-once publication**.

### Consumer window

```text
Tickets DB commits -> Tickets crashes -> XACK was not sent
```

Redis still lists the entry as pending. A live consumer later reclaims it with
`XAUTOCLAIM`. The processed-event ledger recognizes the stable `messageId`, does
not repeat the Ticket mutation, and lets the caller ACK the recovered entry.

Conclusion: consumer commit-before-ACK creates **safe redelivery**.

## Crash-window worksheet

Predict the answer before reading the final column.

| Crash point | Durable evidence | Recovery behavior |
|---|---|---|
| Before Orders transaction commits | Nothing from this attempt | Caller may retry the logical operation |
| After Orders commit, before worker reads | Unpublished publication row | Orders worker finds it later |
| After `XADD`, before `published_at` | Same publication row still due | Republish the same `messageId` |
| Before Tickets transaction commits | Redis pending entry | Consumer retries or another instance reclaims it |
| After Tickets commit, before `XACK` | Ticket effect plus processed receipt; Redis entry pending | Redelivery is detected as duplicate, then ACKed |
| After `XACK` | Consumer receipt and completed group progress | No recovery is needed for this group |

## Idempotency before retry

Never say “we will retry” until these fields are defined:

```text
Stable identity:
Identity scope:
Fingerprint or immutable content:
Stored original outcome:
Exact replay behavior:
Conflicting reuse behavior:
```

For Order events:

- stable identity: `messageId`;
- scope: one logical event for the Tickets consumer;
- immutable content: stored publication envelope;
- exact replay: no second Ticket mutation;
- conflicting reuse: must be treated as invalid evidence, not a new fact.

A random Redis entry ID cannot fill this role because republication changes it.

## Duplicate safety is not stale-message safety

Suppose Order A reserved Ticket T, its reservation was later released, and Order
B then reserved T. A late unique event from Order A is not a duplicate. It is
still dangerous.

Tickets therefore needs a current-state guard:

```text
release only when ticket.status == reserved
and ticket.lockedByOrderId == event.orderId
```

The stable `messageId` answers “Have I handled this fact?” The lock guard answers
“May this fact still change the current Ticket?” You need both.

## Versions: what the course teaches and what exists here

Course lectures 395–409 use Mongoose optimistic concurrency and ordered event
versions. Preserve the distinction between two versions:

| Version | Meaning |
|---|---|
| Event contract version | Shape and meaning of the event schema, currently `v1` |
| Aggregate version | Position of the fact in one Order’s state history |

The current event envelope carries `aggregateVersion`, and Orders owns that
number. Tickets currently relies primarily on terminal event types, processed
message identity, current Ticket status, and matching Order lock guards. A full
per-Order high-water-mark that buffers or rejects every out-of-order version is
not implemented. Do not assume the course’s Mongoose version-query behavior
exists merely because the field exists.

## Pending recovery and poison messages

### Pending recovery

`XREADGROUP` delivers new entries. Until Tickets ACKs one, Redis keeps it in the
consumer group’s Pending Entries List. `XAUTOCLAIM` moves an entry that has been
idle long enough to a live consumer, allowing recovery after a crashed instance.

### Poison messages

Malformed JSON or a schema-invalid envelope cannot become a normal business
retry forever. Tickets first appends evidence to `orders.events.dead-letter`,
then ACKs the original.

The order is deliberate:

```text
dead-letter append succeeds -> ACK original
```

If dead-letter append fails, the original remains pending and recoverable.

## Code reading path

Read only these symbols, in this order:

1. `enqueueOrderEventPublication` in
   `orders/src/messaging/order-event-publication-repo.ts`.
2. `publishOrderEventPublication` in `orders/src/workers.ts`.
3. `startOrderEventsConsumer` and `processEntry` in
   `tickets/src/orders/order-events-consumer.ts`.
4. `orderEventSchema` in `tickets/src/tickets/schemas.ts`.
5. `applyOrderEventOnce` in `tickets/src/tickets/ticket-repo.ts`.

Track only four values: `messageId`, `orderId`, `ticketId`, and Redis entry ID.
Write beside each line whether the value is business identity, application
identity, or transport identity.

## Failure drill

For each interruption, predict the surviving row or broker state:

1. stop Orders immediately before `XADD`;
2. stop Orders immediately after `XADD`;
3. stop Tickets immediately before its SQLite commit;
4. stop Tickets immediately after commit but before `XACK`;
5. deliver the same `messageId` twice;
6. deliver an old expiration for a Ticket locked by a newer Order.

If your answer is only “Redis retries,” it is incomplete. Name the database row,
current-state guard, recovery owner, and definitive completion condition.

## Checkpoint

Derive why “exactly once” is not supplied by Redis alone:

```text
broker redelivery
+ stable application identity
+ atomic processed receipt
+ guarded business mutation
= one business effect under duplicate delivery
```

## Exit gate

Continue to
[Lesson 8: The Durable Design Loop](08-the-durable-design-loop.md) only when you
can point at every crash window and name both the durable evidence and the owner
that resumes work.