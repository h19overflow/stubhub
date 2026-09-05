# Service Boundary — Current Design

**Status:** Current agreed service boundary. Event contracts are not yet defined.

This file is the source of truth for service names, responsibilities, and data
ownership. Boundaries change only when concrete requirements justify it.

## Current baseline

The application has one frontend client and three backend services: Identity,
Tickets, and Orders. Redis Streams is selected as shared event-delivery
infrastructure, not as a service. Event contracts are not yet defined.

```text
Frontend Client
      |
      +--> Identity Service
      +--> Tickets Service
      +--> Orders Service
               +-- Order lifecycle
               +-- Reservation coordination
               +-- Expiration worker/module
               +-- Payments module
                        +-- Stripe adapter

Redis Streams Event Bus
      +-- Shared durable event delivery
      +-- Producers and consumers not yet defined
```

Payments and Expiration are internal Orders capabilities. The next design phase
will define events; this document intentionally leaves event names, publishers,
consumers, and payloads undecided.

## Frontend Client

The client owns authentication screens, ticket browsing and editing, checkout,
countdown, payment UI, order history, and failure states. The server owns locks,
expiration, payment eligibility, and order state. Clients never access databases.

## Identity Service

Identity owns account creation and uniqueness, credential validation and
verification, sign-in, sign-out, current identity, and session or token behavior.

Other services use `userId`; they do not store credentials or read the Identity
database. General profiles and preferences are outside the current scope.

## Tickets Service

Tickets owns listings, seller ownership, listing information, price, discovery,
seller edits, and authoritative availability, lock, and sold state.

A ticket may contain server-owned `ownerId`, `lockedByOrderId`, and
`lockExpiresAt`. Only Tickets changes availability. Sold and release operations
must match `lockedByOrderId`; delayed operations cannot affect another order.

Tickets does not own credentials, order lifecycle, payment attempts, or Stripe
provider state.

## Orders Service

Orders owns purchase intent, lifecycle state, price snapshots, expiration,
payment eligibility, order-history queries, and reservation coordination.

An order references `userId`, `ticketId`, its price snapshot, expiration
deadline, and current status. Orders never modifies the Tickets database.

## Payments inside Orders

Payments is an internal module that creates and verifies provider-specific
payment attempts. Orders retains the business decision about whether an order
may become complete.

The module may store `paymentId`, `orderId`, amount, status, a safe provider
reference, and non-sensitive failure information. It must not store raw card
numbers, expiry details, security codes, or provider secrets.

A separate Payments Service is deferred until independent requirements such as
multiple providers, refunds, payouts, webhooks, separate scaling, or a distinct
financial ownership boundary justify it.

## Expiration inside Orders

Expiration is an Orders worker or module because it causes this Orders-owned
transition:

```text
pending -> expired
```

It must work without an open browser, survive process restarts, and safely
repeat work. Expiration succeeds only when the order is still pending and past
its deadline. This atomic condition resolves the payment race: only one valid
state transition wins.

After expiration, Orders asks Tickets to release the matching lock. Tickets
verifies the order ID before changing availability. A separate worker process
may be useful later, but it remains part of the Orders boundary.

## Current purchase behavior

```text
1. The client asks Orders to purchase a ticket.
2. Orders coordinates a reservation with Tickets.
3. Tickets makes the authoritative availability and lock decision.
4. Orders records or confirms the pending order, price, and deadline.
5. The client receives the order and deadline.
6. Payments attempts payment through Stripe.
7. Orders completes an eligible order and asks Tickets to mark it sold.
8. Orders expires an unpaid pending order and asks Tickets to release its lock.
```

The transport, persistence order, compensation path, and event sequence remain
undecided.

## Ownership summary

| Data or behavior | Current owner |
|---|---|
| Identity and credentials | Identity Service |
| Ticket listing, price, availability, lock, and sold state | Tickets Service |
| Order lifecycle, price snapshot, and expiration decision | Orders Service |
| Expiration scheduling | Orders worker/module |
| Payment attempts | Orders Payments module |
| Stripe integration | Stripe adapter inside Payments |
| Browser presentation | Frontend Client |
| Event delivery | Redis Streams shared infrastructure |

## Communication rules

- Services use explicit contracts and never share databases.
- Cross-service records use IDs, not shared domain models.
- No service imports another service's domain implementation.
- Sensitive credentials and payment details do not cross boundaries.
- Commands and observed facts must be distinguished during event design.
- Duplicate requests and duplicate delivery must be safe.
- Redis Streams delivery is treated as at-least-once; consumers must be
  idempotent and safe for duplicate and late messages.
- Redis Pub/Sub and Redis key-expiration notifications are not used for durable
  business facts or authoritative expiration.

## Open design questions

1. How is the order ID allocated relative to ticket reservation?
2. What happens when reservation succeeds but order persistence fails?
3. What happens when persistence succeeds but communication fails?
4. What ordering and compensation rules protect partial failures?
5. How is authenticated identity propagated internally?
6. Which API operations are public and which are internal?
7. What retry and idempotency guarantees does each operation require?

## Next design step

Define the events collaboratively: what facts must be observed, who owns each
fact, what minimum data crosses the boundary, and how duplicates and out-of-order
delivery behave. No event definitions have been accepted yet.
