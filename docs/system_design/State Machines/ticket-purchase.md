# Ticket Purchase State-Machine Worksheet

**Status:** Completed example.

Beginning a purchase coordinates the Ticket and Order lifecycles. Each service
changes only the entity it owns.

## Ticket lifecycle contribution

```text
Machine selected:
Ticket lifecycle

Business entity:
Ticket

Authoritative owner:
Tickets Service

Relevant invariants:
TP-2, TP-3, TP-7

Transition used by this journey:
available -> reserved

Data recorded with reservation:
lockedByOrderId, reservation deadline
```

| From | Trigger | Guard | To | User-visible result | Retry behavior |
|---|---|---|---|---|---|
| available | Begin purchase for an order | User is authenticated and the ticket is still available | reserved | The ticket is held for the winning order | The same logical order receives the existing reservation; another order is rejected |

## Order lifecycle contribution

```text
Machine selected:
Order lifecycle

Business entity:
Order

Authoritative owner:
Orders Service

Relevant invariants:
TP-1, TP-4, TP-5, TP-6, TP-8, TP-9

Initial state:
pending

Active states:
pending, payment_processing

Terminal states:
complete, expired

Data that is not state:
userId, ticketId, captured amount, expiresAt
```

| From | Trigger | Guard | To | Data captured | Retry behavior |
|---|---|---|---|---|---|
| No order | Matching ticket reservation succeeds | Reservation belongs to this order and buyer | pending | Buyer, ticket, accepted price, and 15-minute deadline | Return the same logical pending order for the repeated purchase request |

## Valid combined outcomes

| Outcome | Ticket | Order | Buyer result |
|---|---|---|---|
| Purchase begins successfully | reserved for this order | pending for this ticket and buyer | Checkout opens with captured price and countdown |
| Ticket is unavailable | reserved by another order or sold | No payable order for the losing buyer | Purchase is rejected as unavailable |
| User is unauthenticated | unchanged | No payable order | Sign-in is required |

The pending Order deadline is authoritative for payment and expiration decisions.
Tickets Service remains authoritative for whether the reservation exists and
which order owns it.

## Partial failure and recovery

| Failure | State that may already exist | Required recovery |
|---|---|---|
| Reservation succeeds but order creation fails | Ticket reserved for the allocated order identity | Orders must finish the matching pending order or cause the guarded reservation to be released |
| Pending order exists but matching reservation cannot be confirmed | Order must not be exposed as payable | Orders reconciles to a matching reservation or removes the payable outcome |
| Successful result is recorded but the browser receives no response | Matching reservation and pending order already exist | Retry returns the same logical order and deadline |

No interruption may leave a permanently orphaned reservation or a payable order
without its matching reservation.

## Buyer-versus-buyer race

- Tickets Service atomically checks and changes `available -> reserved`.
- Exactly one order wins.
- The losing buyer receives no reservation and no payable order.
- The winner may recover the same order after an unknown response.
- Purchasing one's own listing follows the same rules and remains allowed.

## Abandonment boundary

The purchase journey ends after the pending order and matching reservation are
created. Payment transitions are defined in `payment.md`; failure to continue
before the deadline is defined in `expiration.md`.

## Completion check

- Ticket and Order retain separate authoritative owners.
- One ticket has at most one active reservation.
- One purchase request produces one logical pending order.
- A payable order always has its matching reservation.
- Captured amount and deadline do not change on retry.
- Rejection and partial failure cannot create a second winner.
