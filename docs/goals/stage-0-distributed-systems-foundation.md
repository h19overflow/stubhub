# Stage 0 Goal: StubHub as a Distributed-Systems Foundation

## Purpose

Use the existing commerce event flow to develop repeatable failure analysis rather than relying on intuition. The source code is the implementation truth. The system-design documents explain the intended contract and the reasons behind it.

For every drill:

1. state the invariant;
2. predict the result before changing the runtime;
3. trigger one failure window;
4. observe database state, stream state, logs, and user-visible behavior;
5. explain why the invariant survived or failed;
6. make the smallest required correction;
7. repeat the same drill; and
8. record a short postmortem.

## Status legend

- **BUILT** — the supporting production pattern exists in the current source.
- **PARTIAL** — the safety core exists, but an operational capability or broader case is missing.
- **NOT BUILT** — the capability does not exist yet.
- **DRILL PENDING** — the supporting code exists, but the failure has not been deliberately demonstrated and documented.

## Current event path

```text
Orders terminal transition
  -> Orders transaction commits Order + outbox row
  -> Orders worker appends stable envelope to Redis Stream
  -> Tickets consumer group receives or claims the entry
  -> Tickets transaction applies guarded state change + inbox row
  -> Tickets acknowledges the Redis entry
```

## Existing foundation index

| Pattern | Status | Refresh source |
|---|---|---|
| Durable background recovery | BUILT | [`startWorkers`, `scan`, and the durable scans](../../orders/src/workers.ts) |
| Order transition and outbox atomicity | BUILT | [`enqueueTerminal`](../../orders/src/orders/order-repo.ts) |
| Stable outbox message and retry state | BUILT | [`outbox-repo.ts`](../../orders/src/messaging/outbox-repo.ts) and [`003_create_outbox_messages.sql`](../../orders/migrations/003_create_outbox_messages.sql) |
| Redis Streams consumer group | BUILT | [`startOrderEventsConsumer`](../../tickets/src/orders/order-events-consumer.ts) |
| Pending-entry recovery | BUILT | [`recoverPending`](../../tickets/src/orders/order-events-consumer.ts) |
| Ticket transition and inbox atomicity | BUILT | [`consumeOrderEvent`](../../tickets/src/tickets/ticket-repo.ts) |
| Stable duplicate identity | BUILT | `(consumer, message_id)` primary key in [`002_rebuild_ticket_locks_and_inbox.sql`](../../tickets/migrations/002_rebuild_ticket_locks_and_inbox.sql) |
| Stale reservation protection | BUILT | `locked_by_order_id` checks in [`convergenceOutcome`](../../tickets/src/tickets/ticket-repo.ts) |
| Poison-message quarantine | PARTIAL | `parseEvent` and `orders.events.dead-letter` in [`order-events-consumer.ts`](../../tickets/src/orders/order-events-consumer.ts) |
| Redis restart durability | BUILT for local Kubernetes | AOF and PVC in [`infra/k8s/redis/deployment.yaml`](../../infra/k8s/redis/deployment.yaml) |
| Refresh-token family revocation | BUILT | [`refresh-token-repo.ts`](../../auth/src/tokens/refresh-token-repo.ts) and [`signout.ts`](../../auth/src/http/routes/signout.ts) |
| Immediate access-token or user-ban propagation | NOT BUILT | Access JWTs are verified locally in [`common/src/index.ts`](../../common/src/index.ts) |

## Edge-case review matrix

Run this matrix against each durable operation until the questions become automatic.

| Boundary | Question |
|---|---|
| Before the local commit | Does either authoritative state or publishable work exist? |
| After local commit, before broker append | What durable record causes publication to resume? |
| After broker append, before publish progress | What stable identity makes republication safe? |
| Before consumer transaction commit | Can the broker redeliver the uncommitted work? |
| After consumer commit, before acknowledgement | Will redelivery repeat the business mutation? |
| Concurrent consumers | Which database constraint or write lock selects one safe result? |
| Late or reordered delivery | Which current authoritative state guards the transition? |
| Malformed or unsupported input | Can poison work be quarantined without mutating business state? |
| Broker outage | Can authoritative state continue safely without losing publishable facts? |
| Process or pod restart | Which database, stream, pending list, or volume preserves unfinished work? |
| Security propagation delay | How long can a revoked or banned identity remain accepted? |

## Exercise 1: Crash after publish, before outbox progress

**Pattern status:** BUILT  
**Exercise status:** DRILL PENDING

### Invariant

A committed terminal Order fact is eventually published. Republishing the same fact must not create a second business effect.

### Supporting patterns already built

- [`enqueueTerminal`](../../orders/src/orders/order-repo.ts) changes the Order state and inserts the outbox row inside one database transaction.
- The outbox row owns a stable UUID and stores aggregate identity, aggregate version, event type, event version, and payload.
- [`publishMessage`](../../orders/src/workers.ts) performs `XADD` before calling `markOutboxMessagePublished`.
- If the process dies in that gap, `published_at` remains null. The next scan republishes the same envelope with the same `messageId`.
- [`markOutboxMessagePublished`](../../orders/src/messaging/outbox-repo.ts) conditionally marks only an unpublished row.

### Expected observation

Redis may contain two entries with different Redis entry IDs but the same business `messageId`. Tickets applies the business transition once because the inbox uses the stable `messageId`.

### Remaining drill

Add a temporary, controlled crash point after `XADD` and before `markOutboxMessagePublished`, run one terminal Order transition, restart Orders, and record the two Redis entries plus the single Tickets inbox outcome. Remove the crash point after the drill.

## Exercise 2: Crash after consumer commit, before acknowledgement

**Pattern status:** BUILT  
**Exercise status:** DRILL PENDING

### Invariant

Once Tickets commits a business effect, redelivery must not apply the effect again.

### Supporting patterns already built

- [`consumeOrderEvent`](../../tickets/src/tickets/ticket-repo.ts) begins one write transaction.
- It checks `(consumer, message_id)`, applies the guarded Ticket transition, and inserts the inbox row before committing.
- [`processEntry`](../../tickets/src/orders/order-events-consumer.ts) calls `consumeOrderEvent` before `XACK`.
- A crash after the database commit leaves the Redis entry pending.
- [`recoverPending`](../../tickets/src/orders/order-events-consumer.ts) uses `XAUTOCLAIM` so this or another consumer instance can recover abandoned pending work.
- Redelivery finds the inbox marker and returns `duplicate: true` without another Ticket mutation.

### Expected observation

The Ticket state and inbox row are committed before the crash. After restart and pending recovery, the entry is acknowledged without another state change.

### Remaining drill

Add a temporary crash point after `consumeOrderEvent` and before `XACK`. Restart Tickets and inspect the pending entry, the existing inbox row, the unchanged Ticket state, and the final acknowledgement.

## Exercise 3: Deliver the same event five times

**Pattern status:** BUILT  
**Exercise status:** DRILL PENDING

### Invariant

Five deliveries of one stable `messageId` produce at most one Ticket transition.

### Supporting patterns already built

- `inbox_messages` has `PRIMARY KEY (consumer, message_id)` in [`002_rebuild_ticket_locks_and_inbox.sql`](../../tickets/migrations/002_rebuild_ticket_locks_and_inbox.sql).
- [`consumeOrderEvent`](../../tickets/src/tickets/ticket-repo.ts) checks the stable inbox identity inside the same write transaction used for the Ticket transition.
- The consumer identity is the stable capability name `tickets-order-convergence`, not the process-specific Redis consumer name.
- Duplicate delivery can therefore move between running instances and still find the first inbox marker.

### Expected observation

The first delivery records one outcome. The following four deliveries return duplicate and are acknowledged without changing the Ticket.

### Remaining drill

Append the exact same envelope five times with one `messageId`. Record the five stream entries, one inbox row, and one final Ticket transition.

## Exercise 4: Deliver an older event after a newer event

**Pattern status:** BUILT FOR THE CURRENT CONTRACT; GENERAL VERSION ORDERING NOT BUILT  
**Exercise status:** DRILL PENDING

### Invariant

A stale terminal fact cannot change a Ticket controlled by another Order or reverse a safe terminal Ticket state.

### Supporting patterns already built

- [`convergenceOutcome`](../../tickets/src/tickets/ticket-repo.ts) requires the Ticket's current `locked_by_order_id` to equal the event's `aggregateId`.
- A stale release cannot unlock a newer Order's reservation.
- A stale completion cannot sell a Ticket reserved by another Order.
- An already available Ticket remains available, and a sold Ticket is not released.
- `aggregateVersion` is stored in the inbox for diagnosis.

### Deliberate limitation

Tickets does not maintain an Order-version high-water mark and does not authorize with `aggregateVersion`. Order versions belong to Orders; Ticket state and exact `locked_by_order_id` are the current business guard. This safely supports the current two terminal convergence facts, but it is not a generic solution for every future ordered event stream.

The code records diagnostic outcomes, but it does not yet emit a dedicated alert for an impossible pair of distinct terminal facts for one Order.

### Remaining drill

Reserve a Ticket for a newer Order, then deliver a terminal fact for the older Order. Confirm a `not_matching` inbox outcome and no Ticket mutation. Separately deliver a stale fact after `sold` and confirm the terminal Ticket state is unchanged.

## Exercise 5: Stop Redis while Orders changes state

**Pattern status:** BUILT  
**Exercise status:** DRILL PENDING

### Invariant

Redis unavailability must not erase a committed Order fact or become authoritative for Order state.

### Supporting patterns already built

- [`enqueueTerminal`](../../orders/src/orders/order-repo.ts) commits the Order transition and outbox row without requiring Redis.
- [`scanOutbox`](../../orders/src/workers.ts) reads durable unpublished rows.
- Redis connection and `XADD` failures call [`recordOutboxMessageFailure`](../../orders/src/messaging/outbox-repo.ts).
- Failure state includes attempt count, next-attempt time, and the last error.
- Later worker scans retry rows whose `published_at` remains null.

### Expected observation

Orders reaches its authoritative terminal state and retains an unpublished outbox row while Redis is unavailable. When Redis returns, the same durable row is published and marked complete.

### Remaining drill

Stop Redis, complete or expire an Order, inspect the terminal Order and unpublished outbox row, restart Redis, and observe eventual publication and Tickets convergence.

## Exercise 6: Restart services with pending Redis messages

**Pattern status:** BUILT FOR ORDINARY POD OR PROCESS RESTARTS  
**Exercise status:** DRILL PENDING

### Invariant

A process restart must not lose committed facts, unpublished outbox work, consumer pending entries, or committed inbox outcomes.

### Supporting patterns already built

- Orders begins with `await scan()` in [`startWorkers`](../../orders/src/workers.ts), so due durable work is inspected before the recurring timer.
- Tickets calls [`recoverPending`](../../tickets/src/orders/order-events-consumer.ts) before reading new entries and periodically while running.
- Redis uses append-only persistence and a persistent volume in [`infra/k8s/redis/deployment.yaml`](../../infra/k8s/redis/deployment.yaml).
- Orders, Tickets, and Redis Kubernetes deployments mount persistent volumes for local durable state.

### Boundary

This protects ordinary process and pod restarts while their persistent volumes survive. Deleting or corrupting persistent storage is a different disaster-recovery problem and is outside this stage.

### Remaining drill

Create unpublished outbox work and a pending consumer entry, restart Orders, Tickets, and Redis, then prove both the unpublished and pending paths recover without duplicating the business effect.

## Exercise 7: Introduce an unsupported event version

**Pattern status:** BUILT WITH AN OPERATIONS GAP  
**Exercise status:** DRILL PENDING

### Invariant

An unsupported event must not mutate Ticket state or prevent later valid events from being processed.

### Supporting patterns already built

- [`orderEventSchema`](../../tickets/src/tickets/schemas.ts) accepts only `order.completed` or `order.expired`, event version `1`, aggregate type `order`, and the required identifiers and payload.
- [`parseEvent`](../../tickets/src/orders/order-events-consumer.ts) returns null for malformed JSON, an unknown type, or an unsupported version.
- [`processEntry`](../../tickets/src/orders/order-events-consumer.ts) appends the original entry to `orders.events.dead-letter` before acknowledging the original.
- If the dead-letter append fails, `XACK` is not reached and the original remains recoverable.

### Operations gap

There is no dead-letter inspection, alerting, classification, or replay procedure. The log identifies the poison stream entry but does not retain a detailed schema-validation reason.

### Remaining drill

Publish a valid envelope shape with `eventVersion: 2`. Confirm no Ticket or inbox mutation, one dead-letter copy, acknowledgement of the original, and continued processing of the next valid version-1 event.

## Exercise 8: Deliver a permanently invalid message

**Pattern status:** PARTIAL  
**Exercise status:** DRILL PENDING

### Invariant

A poison entry must not mutate business state or block all later valid entries indefinitely.

### Supporting patterns already built

- The consumer quarantines invalid input in `orders.events.dead-letter`.
- It acknowledges the original only after the dead-letter append succeeds.
- The consumer loop continues to later entries after poison handling succeeds.
- A crash after dead-letter append but before original acknowledgement may create duplicate dead-letter copies; those copies are diagnostic, not authoritative business facts.

### Missing operational capabilities

- Dead-letter alerting
- Reason classification beyond the generic poison log
- Inspection and ownership procedure
- Safe replay procedure after a consumer upgrade or data correction
- Retention policy

### Remaining drill

Publish malformed JSON followed by a valid event. Confirm the malformed entry reaches the dead-letter stream, the valid event still converges, and no malformed metadata enters the Tickets business inbox.

## Security exercise: banning users and revoking tokens

### Current authority

Identity owns credentials, refresh-token state, access-token creation, and the future user-ban state. Events may distribute a committed identity fact, but the event bus must not become the authority that decides whether the user is banned.

### Patterns already built

**Refresh-token revocation: BUILT**

- Refresh tokens are opaque random values stored as hashes.
- Rotation makes each presented refresh token single-use.
- Reuse of a rotated token revokes its token family.
- Sign-out revokes the matching refresh-token family.
- These behaviors live in [`refresh-token-repo.ts`](../../auth/src/tokens/refresh-token-repo.ts) and [`signout.ts`](../../auth/src/http/routes/signout.ts).

**Short-lived local access-token verification: BUILT**

- Access tokens are JWTs with a 15-minute TTL.
- Orders and Tickets verify signature, algorithm, issuer, audience, type, expiry, and claims locally through [`verifyAccessToken`](../../common/src/index.ts).
- This avoids an Identity network request on every authenticated API call.

### Capabilities not built

- A durable banned or disabled user field
- An administrative ban command and authorization policy
- Revocation of every active refresh-token family for one user
- A committed `user.banned` or equivalent fact and Identity outbox
- A local banned-user or revoked-token projection in Orders and Tickets
- Synchronous token introspection
- Immediate invalidation of already-issued access JWTs

### The decision that must be made before implementation

Define the maximum acceptable time between a ban/revocation commit and rejection by every service.

- If up to the access-token TTL is acceptable, Identity can block future refreshes while existing JWTs expire naturally.
- An event-fed local denylist can shorten the window after delivery, but it remains eventually consistent during broker delay or outage.
- If rejection must be immediate, services need an immediate authoritative check or another revocation mechanism; an asynchronous event alone cannot provide that guarantee.

The deliberate drill is to delay or stop identity-event delivery and measure how long an already-issued access token remains accepted under the selected design.

## Exit gate

Implementation support is not proof of understanding. Complete the stage only after the drills produce observable evidence and you can explain each guarantee without reading the source.

| Required explanation | Current implementation | Mastery evidence |
|---|---|---|
| What Redis Streams guarantees | Consumer group, pending entries, acknowledgement, claiming, and at-least-once handling are built. | TO DEMONSTRATE with Exercises 2, 3, and 6. |
| What the outbox guarantees | Atomic Order/outbox commit, stable message identity, retry state, and publish progress are built. | TO DEMONSTRATE with Exercises 1 and 5. |
| What the inbox guarantees | Atomic Ticket/inbox commit and stable duplicate identity are built. | TO DEMONSTRATE with Exercises 2 and 3. |
| Why exactly-once business effect comes from idempotency | Stable message IDs, inbox uniqueness, guarded transitions, and acknowledgement-after-commit are built. | TO EXPLAIN after duplicate and crash drills. |
| Every commit, publish, and acknowledgement crash boundary | The intended windows are documented and most recovery paths are implemented. | TO DEMONSTRATE with Exercises 1, 2, 5, and 6. |
| Which security decisions tolerate eventual propagation | The current access-token and refresh-token boundaries are visible; ban propagation is not designed. | OPEN DESIGN DECISION before the ban/revocation event work. |

## Claims to avoid

- Redis Streams does not make the business effect exactly once.
- An outbox does not prove that any consumer processed the event.
- A broker acknowledgement does not prove business success unless it occurs after the authoritative local commit.
- A queue or stream does not authorize a Ticket or identity transition.
- `aggregateVersion` is diagnostic in the current Tickets consumer; arrival order and version are not its business authorization rule.
- Signing out currently revokes refresh capability, not already-issued access JWTs in other services.
- A future `user.banned` event would distribute a fact; it would not by itself provide immediate revocation.

## Memory-refresh reading order

1. [`docs/system_design/events.md`](../system_design/events.md): topology, delivery guarantee, crash windows, duplicate/late behavior, and poison input.
2. [`enqueueTerminal`](../../orders/src/orders/order-repo.ts): atomic terminal Order transition and outbox insert.
3. [`orders/src/workers.ts`](../../orders/src/workers.ts): durable scans, Redis publication, and retry scheduling.
4. [`orders/src/messaging/outbox-repo.ts`](../../orders/src/messaging/outbox-repo.ts): unpublished selection, publish progress, and failure backoff.
5. [`tickets/src/orders/order-events-consumer.ts`](../../tickets/src/orders/order-events-consumer.ts): consumer group, pending recovery, poison handling, and acknowledgement order.
6. [`consumeOrderEvent`](../../tickets/src/tickets/ticket-repo.ts): one Ticket/inbox transaction and duplicate handling.
7. [`tickets/migrations/002_rebuild_ticket_locks_and_inbox.sql`](../../tickets/migrations/002_rebuild_ticket_locks_and_inbox.sql): Ticket lock invariants and inbox constraints.
8. [`auth/src/tokens/refresh-token-repo.ts`](../../auth/src/tokens/refresh-token-repo.ts): refresh rotation, replay detection, and family revocation.
9. [`common/src/index.ts`](../../common/src/index.ts): local JWT validation and the current 15-minute access-token window.

## Completion record

- [ ] Exercise 1: producer crash after stream append
- [ ] Exercise 2: consumer crash after local commit
- [ ] Exercise 3: duplicate delivery five times
- [ ] Exercise 4: stale event after newer state
- [ ] Exercise 5: Redis unavailable during Order transition
- [ ] Exercise 6: services restart with pending work
- [ ] Exercise 7: unsupported event version
- [ ] Exercise 8: permanent poison message
- [ ] Ban/revocation propagation decision accepted
- [ ] Every exit-gate explanation demonstrated
