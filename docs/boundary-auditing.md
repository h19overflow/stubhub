# Service Boundary Audit

**Status:** Accepted as the current service-boundary direction.

`service-boundary.md` is the source of truth. Event contracts remain undecided;
the learner will lead that next design phase.

## Accepted direction

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
```

The course's separate Auth, Orders, Expiration, and Payments services are useful
for practising asynchronous communication, retries, races, and eventual
consistency. They are not automatically better product boundaries.

## Identity instead of User or Auth

The service currently owns credentials, registration, authentication, sessions,
and current-user identity. It does not own profiles, preferences, or other broad
user behavior.

`User Service` therefore overstates its responsibility. `Auth Service` names a
mechanism. `Identity Service` best describes the current capability. Use
`Accounts Service` later only if account-management responsibilities expand.

## Orders instead of Ordering

The service owns persisted orders and their lifecycle. `Orders Service` states
that ownership directly; `Ordering Service` sounds like a workflow.

## Payments inside Orders initially

Connection alone does not determine a service boundary, but the current payment
scope is small:

```text
pending order -> attempt payment -> complete or fail
```

A Payments module inside Orders is sufficient. Payments handles the Stripe
operation; Orders decides whether an order may become complete. Stripe-specific
references remain inside the payment implementation, and sensitive card data is
never stored.

Extract a Payments Service only when independent responsibilities justify it,
such as refunds, multiple providers, payouts, provider webhooks, financial audit
requirements, or separate scaling and security needs.

## Expiration belongs to Orders

Expiration performs an Orders-owned transition:

```text
pending -> expired
```

Orders owns the deadline, eligibility rule, payment race, and final state. The
scheduler may run as a separate worker process for durability without becoming
a separate business service.

The transition must be atomic: expire only an order that is still pending and
past its deadline. If payment has already completed it, expiration does nothing.
If expiration wins, later payment completion is rejected or compensated.

The course's Expiration Service remains a useful delayed-work exercise, but its
exact message contract is intentionally deferred. A timer reports that a
deadline was reached; Orders owns the state decision.

## Ticket release ownership

Tickets remains authoritative for availability and lock state. Orders never
changes the Tickets database directly.

Required behavior:

```text
1. Orders atomically changes pending -> expired.
2. Orders communicates that result through a contract still to be defined.
3. Tickets verifies lockedByOrderId matches the affected order.
4. Tickets releases the lock idempotently.
```

The ownership check prevents delayed duplicate work from unlocking a ticket held
by a newer order.

## Current ownership

| Capability | Owner |
|---|---|
| Credentials and identity | Identity Service |
| Listings, price, availability, and locks | Tickets Service |
| Orders, price snapshots, and expiration decisions | Orders Service |
| Expiration scheduling | Orders worker/module |
| Payment attempts | Orders Payments module |
| Stripe communication | Stripe adapter inside Payments |
| Presentation and countdown | Frontend Client |

## Result

The current system has three backend business services: Identity, Tickets, and
Orders. Payments and Expiration remain internal Orders capabilities. Defining
events is the next step, but no event names, publishers, consumers, or payloads
have been accepted yet.
