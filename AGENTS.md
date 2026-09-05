# StubHub Project Guidance

This file records the current design state for future sessions. Current repository
artifacts remain the source of truth when they disagree with this summary.

## Project purpose

This is a hands-on microservices learning project for a StubHub-like ticket
marketplace. Prefer small, runnable decisions that teach service ownership,
consistency, retries, races, failures, events, APIs, and operational behavior.
Do not add production infrastructure before the current design step requires it.

## Current product decisions

- One authenticated user type may list, edit, and purchase tickets. There is no
  buyer/seller role split.
- Self-purchase is allowed.
- Starting purchase creates one pending Order and temporarily reserves one
  Ticket for about 15 minutes in production.
- A reserved Ticket is unavailable to other buyers and cannot be edited.
- The Order amount is captured when purchase begins and cannot follow later
  Ticket price edits.
- Successful payment completes the Order and makes the Ticket sold.
- Expiration makes an unpaid eligible Order expired and releases only that
  Order's matching Ticket reservation.
- A stale release must check `lockedByOrderId` and cannot unlock a newer
  reservation.
- My Orders includes active Orders and completed purchases.

## Current service boundaries

### React Web Client

Owns browser presentation: identity screens, ticket discovery and management,
checkout countdown, payment UI, order history, and user-visible failure states.
It never decides authoritative availability, payment eligibility, or expiration.

### Identity Service

Owns accounts, account uniqueness, credentials, authentication, sign-out,
current identity, and session behavior.

### Tickets Service

Owns listings, immutable seller ownership, listing information, price,
discovery, editing, authoritative availability, reservation, release, and sold
state. It alone performs guarded Ticket transitions.

Keep Ticket commands and queries as separate code paths inside this one service
for now. Do not create command/query microservices that share a database. A
future Ticket Catalog Service is justified only by measured read-model or scaling
needs and must own a separate read database.

### Orders Service

Owns purchase intent, Order lifecycle, captured prices, payment eligibility,
order history, reservation coordination, and expiration decisions. Payments and
Expiration remain internal Orders capabilities. Orders never writes the Tickets
database.

### Redis Streams event bus

Redis Streams is selected for the current learning implementation. Redis Pub/Sub
is not suitable for durable business facts because disconnected consumers lose
messages.

Assume at-least-once delivery:

- consumers must be idempotent;
- duplicate and late delivery must be safe;
- ordering requirements must be defined per business entity;
- pending-message recovery must be designed;
- database commits and publication need an outbox or equivalent recovery rule;
- the broker never becomes authoritative for Ticket or Order state; and
- Redis key-expiration notifications must not drive authoritative Order
  expiration.

Event names, stream names, consumer groups, payloads, retention, and versioning
have not been accepted yet.

## Completed design artifacts

- Business journeys: `docs/system_design/journies/`
- Business invariants: `docs/system_design/invariants.md`
- Worked state machines: `docs/system_design/State Machines/`
- C4 context diagram: `docs/system_design/Arch/c4-context.md`
- C4 container diagram: `docs/system_design/Arch/c4-container.md`
- Ticket CQRS decision: `docs/system_design/Arch/ticket-cqrs.md`
- Broker comparison: `docs/system_design/Arch/event-bus-comparison.md`
- Service ownership source: `docs/specifications/service-boundary.md`

The core state vocabulary is:

```text
Ticket: available -> reserved -> sold
                    reserved -> available on guarded release

Order: pending -> payment_processing -> complete
       pending -> expired
       payment_processing -> pending after failure with time remaining
       payment_processing -> expired after failure past the deadline

Payment Attempt: processing -> succeeded | failed
```

An on-time payment already in `payment_processing` must resolve before the Ticket
is released. Complete and expired are mutually exclusive terminal Order states.

## Next design work

The requested goal is to reach concrete sequence diagrams and then implementation
specifications for events and APIs. Preserve this order so diagrams do not invent
contracts:

1. Create `interaction_flows.md`: chronological business steps, actor, requested
   decision, one decision owner, state change, response, and failure point.
2. Create `communication.md`: decide which interactions require immediate
   responses and which represent asynchronous committed facts.
3. Create `events.md`: define owner, trigger, minimum payload, consumers,
   duplicate behavior, out-of-order behavior, and versioning.
4. Create `api_contracts.md`: define public/internal operations, authorization,
   responses, business errors, and idempotency.
5. Create `data_and_consistency.md`: define owned records, constraints,
   transactions, outbox/recovery, and durable expiration work.
6. Create `sequence_diagrams.md`: render the successful flows and important
   failure/race flows using the accepted decisions above.

Start with Ticket purchase, payment, and expiration because they expose the
important cross-service and concurrency behavior. A sequence diagram may be
drafted earlier as a thinking aid, but it is not authoritative until the
communication, event, API, and recovery decisions exist.

## Important unresolved questions

- How is Order identity allocated relative to Ticket reservation?
- How does reservation recover when Order persistence or the response fails?
- Which interactions are immediate requests and which are committed facts?
- Which facts require Redis Streams publication?
- What ordering key is required for Ticket and Order facts?
- How are duplicate, late, and out-of-order messages handled per consumer?
- What outbox and consumer-inbox/idempotency records are required?
- How is authenticated `userId` propagated between backend services?
- Which APIs are public and which are internal?
- What happens when payment provider acceptance and local persistence disagree?

## Working guardrails

- Define business facts before naming events or Redis streams.
- Do not use the event bus for decisions that require an immediate authoritative
  answer, such as winning a reservation or checking payment eligibility.
- Do not let read models authorize purchases; Tickets rechecks availability.
- Do not share databases between services.
- Do not add a separate Payments, Expiration, Command Tickets, or Query Tickets
  service without a concrete independent boundary.
- Structure subsystem boundaries as deep modules (`skill://deep-module-design`, `skill://information-hiding`):
  hide transport details, internal database schemas, batching, and retry loops behind
  simple intent-oriented interfaces.
- Keep manual verification small and local. Do not add automated tests unless the
  user explicitly requests them.
