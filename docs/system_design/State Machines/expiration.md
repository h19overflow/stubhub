# Expiration State-Machine Worksheet

**Status:** Completed example.

Expiration changes the Order first, then releases the separately owned Ticket
reservation with a matching-order guard.

## Order lifecycle contribution

```text
Machine selected:
Order lifecycle

Business entity:
Order

Authoritative owner:
Orders Service

Relevant invariants:
EX-1, EX-2, EX-3, EX-4, EX-6

Transition used by expiration:
pending -> expired

Terminal state reached:
expired

Data used by the guard:
expiresAt, current state
```

| From | Trigger | Guard | To | User-visible outcome | Retry behavior |
|---|---|---|---|---|---|
| pending | Authoritative deadline is reached | Current time is at or after expiresAt and no payment is processing | expired | Countdown ends; Pay is unavailable; purchase must restart | Return the existing expired result |

## Order non-transitions

| Current state or condition | Expiration result |
|---|---|
| pending before deadline | No state change |
| payment_processing | No state change while the on-time payment remains unresolved |
| complete | No state change; completed purchase remains complete |
| expired | No state change; repeated expiration is harmless |

An expired order can never return to `pending`, `payment_processing`, or
`complete`.

## Payment-versus-expiration race

Payment submission and expiration both compete from `pending` inside Orders
Service:

- If valid payment submission wins, the order becomes `payment_processing` and
  expiration is rejected.
- If expiration wins, the order becomes `expired` and payment submission is
  rejected.
- Both transitions cannot succeed for the same order.
- Browser timing does not select the winner; the authoritative Order transition
  does.

If an existing `payment_processing` attempt later fails after the deadline, the
payment flow moves the order to `expired` and uses the same Ticket-release rule
below.

## Ticket lifecycle contribution

```text
Machine selected:
Ticket lifecycle

Business entity:
Ticket

Authoritative owner:
Tickets Service

Relevant invariants:
EX-5, EX-7

Transition used by expiration:
reserved -> available

Data used by the guard:
lockedByOrderId
```

| From | Trigger | Guard | To | Retry or stale result |
|---|---|---|---|---|
| reserved | Release expired order's reservation | lockedByOrderId matches the expired order | available | A duplicate release leaves it available |

## Ticket non-transitions

| Ticket condition | Release result |
|---|---|
| reserved by another order | No state change; the newer reservation remains protected |
| sold | No state change |
| already available | No state change |

## Cross-machine outcomes

| Situation | Order | Ticket | Required action |
|---|---|---|---|
| Expiration completes normally | expired | available | None |
| Order expires but release temporarily fails | expired | reserved by that order | Orders keeps release recoverable and retries the guarded operation |
| Delayed release arrives after a newer reservation | expired old order | reserved by newer order | Tickets rejects the stale release |
| Payment completed before expiration | complete | sold or awaiting guarded sale recovery | Expiration does nothing |

## Restart and retry rules

- `expiresAt` and the Order state are durable.
- Expiration works without an open browser.
- Restarting a process does not extend the deadline.
- Missed expiration work remains discoverable and repeatable.
- Repeated expiration cannot change a terminal order.
- Release recovery continues until the matching reservation is released, without
  touching a newer reservation.

## Completion check

- Only eligible pending orders expire.
- Payment processing and expiration cannot both win.
- Complete and expired remain mutually exclusive.
- Expiration is durable and idempotent.
- Ticket release requires the matching order identifier.
- Partial release failure cannot create an infinite lock.
