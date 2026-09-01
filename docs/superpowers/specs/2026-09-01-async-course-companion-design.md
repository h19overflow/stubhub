# Async Systems Course Companion Design

## Purpose

Create an advanced learning companion that maps course lectures 314–450 to the current StubHub implementation without copying obsolete NATS Streaming, Mongoose, Bull, or service-boundary decisions into this repository.

The companion extends the existing first-principles course in `docs/service-design/`. It must preserve that course's slow learning style: one focused lesson at a time, exact current-code evidence, one useful visual, a written checkpoint, and an exit gate.

## Source-of-truth order

When sources disagree, use this order:

1. Current repository code and migrations.
2. Accepted current project guidance and system-design decisions.
3. The user-provided lecture number and title list.
4. Inferences from a lecture title.

The course videos are external material. A title does not prove the video's exact implementation details. Any mapping based only on a title must say so rather than inventing content.

## Current architecture that the companion must preserve

- Redis Streams is the broker; NATS Streaming is not used.
- Orders commits terminal Order changes and `order_event_publications` rows together.
- The Orders worker publishes due rows to `orders.events`, then records publication progress.
- Tickets consumes through the `tickets-order-convergence` Redis consumer group.
- Tickets commits the guarded Ticket effect and `processed_order_events` receipt together, then sends `XACK`.
- Redis redelivery is at least once; stable application `messageId` values and the processed-event ledger prevent duplicate business effects.
- Tickets owns listing availability, reservation locks, release, sold state, and edit eligibility.
- Orders owns purchase intent, Order lifecycle, captured Ticket/price snapshots, payment coordination, and expiration decisions.
- Reservation is an immediate Orders-to-Tickets command because Orders needs an authoritative winner before returning a purchase result.
- Only accepted terminal Order facts, currently `order.completed` and `order.expired`, cross Redis Streams to Tickets.
- Expiration remains an internal Orders capability. Do not add a separate Expiration service or Bull queue.
- SQLite transactions, constraints, and guarded SQL replace Mongoose document methods and plugins.
- The current code uses concrete publisher/consumer functions. Do not introduce abstract Listener/Publisher hierarchies, singletons, factories, or mocks merely to resemble the course.

## Classification model

Every lecture from 314 through 450 must appear exactly once in the exhaustive map with one classification:

| Classification | Meaning | Learner action |
|---|---|---|
| `KEEP` | The concept directly applies to the current implementation. | Study the lecture, then trace the named current code. |
| `TRANSLATE` | The concept is useful, but the product, technology, or service boundary differs. | Study the concept, ignore the original mechanism, then follow the current replacement. |
| `SKIP` | The item is obsolete, product-specific, redundant, or would add needless architecture. | Skip it or read only for historical context. Do not implement it. |
| `GAP` | The concept is valuable but current implementation or proof is incomplete. | Study it as a deliberate exercise or future validation target, not as an existing capability. |

Each map row must contain:

1. lecture number and exact user-provided title;
2. classification;
3. plain-language reason;
4. current replacement or explicit absence;
5. exact repository file and symbol evidence;
6. recommended learner action;
7. concept-module link.

## Documentation structure

Create `docs/service-design/async-systems/` containing the following files.

### `index.md`

The entry point must explain:

- prerequisites: complete service-design lessons 01–10 first;
- how the companion differs from the external course;
- the four classifications;
- the reading order;
- the rule that course technology is not automatically the project design;
- the spaced-review rhythm already used by the parent course; and
- a dependency map linking the six concept modules.

### `lecture-map-314-450.md`

This is the exhaustive source for the lecture mapping. It must:

- include every number from 314 through 450 exactly once;
- use the exact titles supplied by the user;
- group rows into the four requested ranges: 314–349, 350–383, 384–431, and 432–450;
- link every row to one concept module;
- distinguish course-specific implementation from current project behavior;
- state title-only uncertainty where appropriate; and
- end with concise study playlists: must-watch, translate-while-watching, skip, and current gaps.

### `01-typed-event-contracts.md`

Map primarily to lectures 314–329 and related contract items later in the range. Teach:

- transport identity versus stable application identity;
- event name, version, aggregate identity/version, timestamp, and payload;
- TypeScript compile-time types versus Zod runtime validation;
- why untrusted broker data must be parsed before use;
- why a concrete event schema is preferable to speculative base classes;
- what may be shared and what remains service-owned; and
- why the current absence of `ticket.updated`, `order.created`, and `order.cancelled` is deliberate.

Primary evidence includes `orders/src/workers.ts`, `orders/src/messaging/order-event-publication.ts`, `tickets/src/tickets/ticket.ts`, and `tickets/src/tickets/schemas.ts`.

### `02-orders-boundary-and-reservation.md`

Map primarily to lectures 350–383. Teach:

- Orders and Tickets ownership;
- external IDs versus Mongoose references;
- immutable snapshots versus current authoritative state;
- immediate reservation commands versus asynchronous committed facts;
- purchase idempotency and durable unfinished-work rows;
- Order states and database constraints;
- list/detail ownership checks;
- why user cancellation and order-created publication are current gaps or non-events; and
- how terminal Order facts enter the publication ledger.

Primary evidence includes `orders/src/orders/purchase-workflow.ts`, `orders/src/orders/order-repo.ts`, `orders/src/tickets-client.ts`, Tickets internal reservation routes, and the Orders HTTP routes.

### `03-durable-publication-and-consumption.md`

Map publishing/listening lectures across all ranges. Teach:

- business transaction plus publication ledger transaction;
- worker selection of due rows;
- `XADD` before `published_at`;
- the duplicate-publication crash window;
- Redis Streams, consumer groups, consumer names, pending entries, and `XREADGROUP`;
- poison-message dead-letter-before-ACK behavior;
- `XAUTOCLAIM` recovery;
- consumer effect plus processed-event receipt transaction;
- ACK after durable processing;
- startup and graceful shutdown; and
- Redis/Kubernetes configuration relevant to the flow.

Primary evidence includes `orders/src/messaging/`, `orders/src/workers.ts`, `tickets/src/orders/order-events-consumer.ts`, service lifecycle files, `skaffold.yaml`, and Redis manifests.

### `04-concurrency-versioning-and-locks.md`

Map primarily to lectures 384–431. Teach:

- race conditions as competing state transitions;
- SQLite `BEGIN IMMEDIATE`, constraints, and guarded `UPDATE` predicates;
- optimistic-concurrency intent without Mongoose plugins;
- who owns and increments an entity version;
- event schema version versus aggregate version;
- duplicate detection versus stale-message protection;
- exact `lockedByOrderId` guards;
- reservation replay/conflict behavior;
- rejecting edits of reserved or sold Tickets; and
- the explicit current limitation: aggregate version is validated and recorded but no generic high-water mark or version-ordered replay is implemented.

The module must not claim that Redis ordering alone authorizes state changes.

### `05-expiration-without-an-expiration-service.md`

Map lectures 432–450. Teach:

- why expiration changes Orders-owned state and remains inside Orders;
- persisted deadlines and due-work queries;
- startup and interval scans;
- why `setTimeout`, Redis key-expiration notifications, and browser countdowns are not authoritative;
- why Bull is unnecessary for the current scale and design;
- the payment-versus-expiration race;
- atomic `pending -> expired` plus durable publication work;
- `order.expired` as the accepted terminal fact;
- Tickets' guarded matching-order release; and
- restart/retry behavior.

The module must contrast the external course's separate Expiration service and intermediate event chain with the simpler current boundary, without presenting the current decision as universally correct.

### `06-runtime-proof-and-failure-drills.md`

Turn the classified `GAP` items into learning exercises. Include:

- producer crash before publication;
- producer crash after `XADD` before publication progress;
- consumer crash before commit;
- consumer crash after commit before `XACK`;
- exact duplicate delivery;
- stale `order.expired` against a newer lock;
- poison event dead-lettering;
- Redis outage and restart;
- Orders/Tickets process restart;
- publication backlog and pending-entry evidence;
- reservation contention;
- payment-versus-expiration race;
- consumer-aware health gap;
- horizontal-replica gap; and
- generic aggregate-version ordering gap.

For every drill, define prediction, injection point, durable evidence, expected recovery owner, expected final state, and cleanup. Do not claim a drill has passed unless it is actually executed later.

## Module content contract

Every concept module must include:

1. **Goal** — one observable learning outcome.
2. **Course mapping** — exact lecture ranges and the concepts retained, translated, skipped, or marked as gaps.
3. **Plain-language model** — introduce the problem before technology.
4. **Current StubHub flow** — exact owners and source paths.
5. **One minimal Mermaid visual** — only where sequence or state is clearer visually.
6. **Failure analysis** — crashes, duplicates, stale work, and restarts relevant to the module.
7. **What not to copy** — explicit rejection of obsolete or mismatched course architecture.
8. **Practice** — a prediction, trace, or manual exercise.
9. **Checkpoint** — written recall without the file open.
10. **Exit gate** — evidence that the learner can transfer the concept.

## Course-to-project translation rules

- NATS Streaming listener/publisher APIs become Redis Streams operations and concrete worker/consumer functions.
- NATS subjects become explicit stream names plus event-type validation; do not create a central enum without a current reuse need.
- NATS queue groups become Redis consumer groups.
- NATS manual ACK becomes Redis `XACK` after the consumer transaction.
- NATS durable subscriptions become stable Redis group state, pending entries, Redis persistence, and explicit pending recovery.
- NATS client IDs become per-process Redis consumer names; stable business deduplication still uses application `messageId`.
- Mongoose documents, refs, methods, and update-if-current plugins become SQLite row types, opaque cross-service IDs, local transactions, constraints, and guarded SQL.
- Generic abstract Listener/Publisher classes become focused functions because only one concrete flow currently needs them.
- Mocked broker tests become observable HTTP, SQLite, filesystem, Redis, and pending-entry evidence where practical.
- A separate Bull-backed Expiration service becomes Orders-owned durable due work and terminal publication.

## Explicit gaps and non-claims

The companion must state that the current repository does not yet prove or implement:

- a general aggregate-version high-water mark or ordered replay mechanism;
- listener/worker crash-window integration tests;
- ACK-ordering tests;
- reservation contention tests;
- consumer-aware readiness or liveness;
- horizontally scaled Tickets consumer behavior in Kubernetes;
- production-high-availability Redis; or
- user-driven Order cancellation.

These are exercises or future decisions, not hidden acceptance criteria for this documentation task.

## Parent-course integration

Update `docs/service-design/index.md` with one advanced-companion section after the existing reading order. It must link `async-systems/index.md` and state that lessons 01–10 remain prerequisites.

Do not renumber or inflate the existing beginner lessons.

## Verification

Documentation verification must include:

1. a programmatic check that lecture numbers 314–450 appear exactly once in the exhaustive map;
2. a programmatic relative-link check for the new files and modified parent index;
3. extraction and rendering of every Mermaid block with Mermaid CLI;
4. inspection of rendered visuals for correct direction, ownership, and labels;
5. `git diff --check` for whitespace errors; and
6. a final evidence review against the current source symbols cited by the documents.

No application code, migrations, dependencies, Kubernetes resources, or automated product tests are part of this documentation change.
