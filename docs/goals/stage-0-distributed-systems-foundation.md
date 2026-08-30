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
  -> Orders transaction commits Order + event publication ledger row (outbox pattern)
  -> Orders worker appends stable envelope to Redis Stream
  -> Tickets consumer group receives or claims the entry
  -> Tickets transaction applies guarded state change + processed-event ledger row (inbox pattern)
  -> Tickets acknowledges the Redis entry
```

## Existing foundation index

| Pattern | Status | Refresh source |
|---|---|---|
| Durable background recovery | BUILT | [`startWorkers`, `scan`, and the durable scans](../../orders/src/workers.ts) |
| Order transition and event publication ledger atomicity | BUILT | [`enqueueTerminal`](../../orders/src/orders/order-repo.ts) |
| Stable event publication ledger message and retry state | BUILT | [`OrderEventPublication`](../../orders/src/messaging/order-event-publication.ts), [`order-event-publication-repo.ts`](../../orders/src/messaging/order-event-publication-repo.ts), and [`010_rename_outbox_messages.sql`](../../orders/migrations/010_rename_outbox_messages.sql) |
| Redis Streams consumer group | BUILT | [`startOrderEventsConsumer`](../../tickets/src/orders/order-events-consumer.ts) |
| Pending-entry recovery | BUILT | [`recoverPending`](../../tickets/src/orders/order-events-consumer.ts) |
| Ticket transition and processed-event ledger atomicity | BUILT | [`applyOrderEventOnce`](../../tickets/src/tickets/ticket-repo.ts) |
| Stable duplicate identity | BUILT | Historical [`002_rebuild_ticket_locks_and_inbox.sql`](../../tickets/migrations/002_rebuild_ticket_locks_and_inbox.sql) defines `(consumer, message_id)` as the processed-event ledger primary key; forward [`003_rename_inbox_messages.sql`](../../tickets/migrations/003_rename_inbox_messages.sql) preserves it while renaming the table and indexes |
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

## Exercise 1: Crash after publication, before ledger progress

**Pattern status:** BUILT  
**Exercise status:** DRILL PENDING

### Invariant

A committed terminal Order fact is eventually published. Republishing the same fact must not create a second business effect.

### Supporting patterns already built

- The terminal Order transition calls [`enqueueTerminal`](../../orders/src/orders/order-repo.ts), which inserts the event publication ledger row inside the same database transaction.
- The event publication ledger row owns a stable UUID and stores aggregate identity, aggregate version, event type, event version, and payload.
- [`publishOrderEventPublication`](../../orders/src/workers.ts) performs `XADD` before calling [`markOrderEventPublished`](../../orders/src/messaging/order-event-publication-repo.ts).
- If the process dies in that gap, `published_at` remains null. The next scan republishes the same envelope with the same `messageId`.
- [`markOrderEventPublished`](../../orders/src/messaging/order-event-publication-repo.ts) conditionally marks only an unpublished row.

### Expected observation

Redis may contain two entries with different Redis entry IDs but the same business `messageId`. Tickets applies the business transition once because the processed-event ledger uses the stable `messageId`.

### Remaining drill

Add a temporary, controlled crash point after `XADD` and before `markOrderEventPublished`, run one terminal Order transition, restart Orders, and record the two Redis entries plus the single Tickets processed-event ledger outcome. Remove the crash point after the drill.

## Exercise 2: Crash after consumer commit, before acknowledgement

**Pattern status:** BUILT  
**Exercise status:** DRILL PENDING

### Invariant

Once Tickets commits a business effect, redelivery must not apply the effect again.

### Supporting patterns already built

- [`applyOrderEventOnce`](../../tickets/src/tickets/ticket-repo.ts) begins one write transaction.
- It checks `(consumer, message_id)`, applies the guarded Ticket transition, and inserts the processed-event ledger row before committing.
- [`processEntry`](../../tickets/src/orders/order-events-consumer.ts) calls `applyOrderEventOnce` before `XACK`.
- A crash after the database commit leaves the Redis entry pending.
- [`recoverPending`](../../tickets/src/orders/order-events-consumer.ts) uses `XAUTOCLAIM` so this or another consumer instance can recover abandoned pending work.
- Redelivery finds the processed-event ledger marker and returns `duplicate: true` without another Ticket mutation.

### Expected observation

The Ticket state and processed-event ledger row are committed before the crash. After restart and pending recovery, the entry is acknowledged without another state change.

### Remaining drill

Add a temporary crash point after `applyOrderEventOnce` and before `XACK`. Restart Tickets and inspect the pending entry, the existing processed-event ledger row, the unchanged Ticket state, and the final acknowledgement.

## Exercise 3: Deliver the same event five times

**Pattern status:** BUILT  
**Exercise status:** DRILL PENDING

### Invariant

Five deliveries of one stable `messageId` produce at most one Ticket transition.

### Supporting patterns already built

- Historical migration [`002_rebuild_ticket_locks_and_inbox.sql`](../../tickets/migrations/002_rebuild_ticket_locks_and_inbox.sql) defines the processed-event ledger `PRIMARY KEY (consumer, message_id)`; forward migration [`003_rename_inbox_messages.sql`](../../tickets/migrations/003_rename_inbox_messages.sql) preserves it while renaming the table and indexes.
- [`applyOrderEventOnce`](../../tickets/src/tickets/ticket-repo.ts) checks the stable processed-event ledger identity inside the same write transaction used for the Ticket transition.
- The consumer identity is the stable capability name `tickets-order-convergence`, not the process-specific Redis consumer name.
- Duplicate delivery can therefore move between running instances and still find the first processed-event ledger marker.

### Expected observation

The first delivery records one outcome. The following four deliveries return duplicate and are acknowledged without changing the Ticket.

### Remaining drill

Append the exact same envelope five times with one `messageId`. Record the five stream entries, one processed-event ledger row, and one final Ticket transition.

## Exercise 4: Deliver an older event after a newer event

**Pattern status:** BUILT FOR THE CURRENT CONTRACT; GENERAL VERSION ORDERING NOT BUILT  
**Exercise status:** DRILL PENDING

### Invariant

A stale terminal fact cannot change a Ticket controlled by another Order or reverse a safe terminal Ticket state.

### Supporting patterns already built

- [`applyOrderEventOnce`](../../tickets/src/tickets/ticket-repo.ts) requires the Ticket's current `locked_by_order_id` to equal the event's `aggregateId`.
- A stale release cannot unlock a newer Order's reservation.
- A stale completion cannot sell a Ticket reserved by another Order.
- An already available Ticket remains available, and a sold Ticket is not released.
- `aggregateVersion` is stored in the processed-event ledger for diagnosis.

### Deliberate limitation

Tickets does not maintain an Order-version high-water mark and does not authorize with `aggregateVersion`. Order versions belong to Orders; Ticket state and exact `locked_by_order_id` are the current business guard. This safely supports the current two terminal convergence facts, but it is not a generic solution for every future ordered event stream.

The code records diagnostic outcomes, but it does not yet emit a dedicated alert for an impossible pair of distinct terminal facts for one Order.

### Remaining drill

Reserve a Ticket for a newer Order, then deliver a terminal fact for the older Order. Confirm a `not_matching` processed-event ledger outcome and no Ticket mutation. Separately deliver a stale fact after `sold` and confirm the terminal Ticket state is unchanged.

## Exercise 5: Stop Redis while Orders changes state

**Pattern status:** BUILT  
**Exercise status:** DRILL PENDING

### Invariant

Redis unavailability must not erase a committed Order fact or become authoritative for Order state.

### Supporting patterns already built

- [`enqueueTerminal`](../../orders/src/orders/order-repo.ts) commits the Order transition and event publication ledger row without requiring Redis.
- [`scanOrderEventPublications`](../../orders/src/workers.ts) reads durable unpublished rows.
- Redis connection and `XADD` failures call [`recordOrderEventPublicationFailure`](../../orders/src/messaging/order-event-publication-repo.ts).
- Failure state includes attempt count, next-attempt time, and the last error.
- Later worker scans retry rows whose `published_at` remains null.

### Expected observation

Orders reaches its authoritative terminal state and retains an unpublished event publication ledger row while Redis is unavailable. When Redis returns, the same durable row is published and marked complete.

### Remaining drill

Stop Redis, complete or expire an Order, inspect the terminal Order and unpublished event publication ledger row, restart Redis, and observe eventual publication and Tickets convergence.

## Exercise 6: Restart services with pending Redis messages

**Pattern status:** BUILT FOR ORDINARY POD OR PROCESS RESTARTS  
**Exercise status:** DRILL PENDING

### Invariant

A process restart must not lose committed facts, unpublished event publication ledger work, consumer pending entries, or committed processed-event ledger outcomes.

### Supporting patterns already built

- Orders begins with `await scan()` in [`startWorkers`](../../orders/src/workers.ts), which invokes [`scanOrderEventPublications`](../../orders/src/workers.ts), so due event publication ledger work is inspected before the recurring timer.
- Tickets calls [`recoverPending`](../../tickets/src/orders/order-events-consumer.ts) before reading new entries and periodically while running.
- [`processEntry`](../../tickets/src/orders/order-events-consumer.ts) calls [`applyOrderEventOnce`](../../tickets/src/tickets/ticket-repo.ts) before `XACK`.
- [`applyOrderEventOnce`](../../tickets/src/tickets/ticket-repo.ts) commits the guarded Ticket change and processed-event ledger row atomically.
- If a restart causes redelivery, `applyOrderEventOnce` sees the processed-event ledger marker, makes no second Ticket mutation, and `processEntry` then acknowledges the entry.
- Redis uses append-only persistence and a persistent volume in [`infra/k8s/redis/deployment.yaml`](../../infra/k8s/redis/deployment.yaml).
- Orders, Tickets, and Redis Kubernetes deployments mount persistent volumes for local durable state.

### Boundary

This protects ordinary process and pod restarts while their persistent volumes survive. Deleting or corrupting persistent storage is a different disaster-recovery problem and is outside this stage.

### Remaining drill

Create unpublished event publication ledger work and a pending consumer entry, restart Orders, Tickets, and Redis, then prove both the unpublished and pending paths recover without duplicating the business effect.

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

Publish a valid envelope shape with `eventVersion: 2`. Confirm no Ticket or processed-event ledger mutation, one dead-letter copy, acknowledgement of the original, and continued processing of the next valid version-1 event.

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

Publish malformed JSON followed by a valid event. Confirm the malformed entry reaches the dead-letter stream, the valid event still converges, and no malformed metadata enters the Tickets processed-event ledger.

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
- A committed `user.banned` or equivalent fact and Identity event publication ledger
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
| What the event publication ledger guarantees | Atomic Order/ledger commit, stable message identity, retry state, and publish progress are built. | TO DEMONSTRATE with Exercises 1 and 5. |
| What the processed-event ledger guarantees | Atomic Ticket/ledger commit and stable duplicate identity are built. | TO DEMONSTRATE with Exercises 2 and 3. |
| Why exactly-once business effect comes from idempotency | Stable message IDs, processed-event ledger uniqueness, guarded transitions, and acknowledgement-after-commit are built. | TO EXPLAIN after duplicate and crash drills. |
| Every commit, publish, and acknowledgement crash boundary | The intended windows are documented and most recovery paths are implemented. | TO DEMONSTRATE with Exercises 1, 2, 5, and 6. |
| Which security decisions tolerate eventual propagation | The current access-token and refresh-token boundaries are visible; ban propagation is not designed. | OPEN DESIGN DECISION before the ban/revocation event work. |

## Claims to avoid

- Redis Streams does not make the business effect exactly once.
- An event publication ledger does not prove that any consumer processed the event.
- A broker acknowledgement does not prove business success unless it occurs after the authoritative local commit.
- A queue or stream does not authorize a Ticket or identity transition.
- `aggregateVersion` is diagnostic in the current Tickets consumer; arrival order and version are not its business authorization rule.
- Signing out currently revokes refresh capability, not already-issued access JWTs in other services.
- A future `user.banned` event would distribute a fact; it would not by itself provide immediate revocation.

## Memory-refresh reading order

1. [`docs/system_design/events.md`](../system_design/events.md): topology, delivery guarantee, crash windows, duplicate/late behavior, and poison input.
2. [`enqueueTerminal`](../../orders/src/orders/order-repo.ts): atomic terminal Order transition and event publication ledger insert.
3. [`orders/src/workers.ts`](../../orders/src/workers.ts): durable scans, Redis publication, and retry scheduling.
4. [`orders/src/messaging/order-event-publication.ts`](../../orders/src/messaging/order-event-publication.ts): `OrderEventPublication` contract.
5. [`orders/src/messaging/order-event-publication-repo.ts`](../../orders/src/messaging/order-event-publication-repo.ts): unpublished selection, publication progress, and failure backoff.
6. [`tickets/src/orders/order-events-consumer.ts`](../../tickets/src/orders/order-events-consumer.ts): consumer group, pending recovery, poison handling, and acknowledgement order.
7. [`applyOrderEventOnce`](../../tickets/src/tickets/ticket-repo.ts): one Ticket/processed-event ledger transaction and duplicate handling.
8. Historical [`tickets/migrations/002_rebuild_ticket_locks_and_inbox.sql`](../../tickets/migrations/002_rebuild_ticket_locks_and_inbox.sql) defines the Ticket lock and processed-event schema/primary key; forward [`tickets/migrations/003_rename_inbox_messages.sql`](../../tickets/migrations/003_rename_inbox_messages.sql) preserves rows while renaming the table and indexes.
9. [`auth/src/tokens/refresh-token-repo.ts`](../../auth/src/tokens/refresh-token-repo.ts): refresh rotation, replay detection, and family revocation.
10. [`common/src/index.ts`](../../common/src/index.ts): local JWT validation and the current 15-minute access-token window.

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
