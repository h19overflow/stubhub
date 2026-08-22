# Ticket Management State-Machine Worksheet

**Status:** Completed example.

Ticket management contributes creation and price-editing rules to the shared
Ticket lifecycle.

## Ticket lifecycle

```text
Machine selected:
Ticket lifecycle

Business entity:
Ticket

Authoritative owner:
Tickets Service

Relevant invariants:
TM-1, TM-2, TM-3, TM-4, TM-5, TM-6

Initial state:
available

Active states:
available, reserved

Terminal states:
sold

Data that is not state:
ownerId, image, description, event information, price, lockedByOrderId,
reservation deadline
```

## State meanings

| State | Management meaning |
|---|---|
| available | The owner may edit the price; the ticket may be discovered and reserved |
| reserved | Editing is forbidden while a pending order holds the ticket |
| sold | The lifecycle is complete; editing and new purchase are forbidden |

## Creation and edit rules

| From | Trigger | Guard | To | Data changed | Retry behavior |
|---|---|---|---|---|---|
| No ticket | Create listing | User is authenticated; required listing information and price are valid | available | Listing fields and immutable ownerId are recorded | Retrying the same creation request returns one logical listing, not duplicates |
| available | Edit price | Acting user is the owner and the new price is valid | available | Price changes | Repeating the same price produces no additional change |

Price editing is a state-preserving update. The ticket remains `available`, but
the update is legal only in that state.

## Rejected actions and non-transitions

| Attempt | Current condition | Required result |
|---|---|---|
| Create listing | User is unauthenticated or input is invalid | No ticket is created |
| Edit price | Acting user is not the owner | Ticket remains unchanged |
| Edit price | Ticket is reserved | Ticket and reservation remain unchanged |
| Edit price | Ticket is sold | Ticket remains sold |
| Edit price | New price is invalid | Ticket remains unchanged |

## Edit-versus-reservation race

Tickets Service decides the winner atomically:

- If the price edit wins first, the ticket remains available with the new price;
  a later reservation captures that new price.
- If reservation wins first, the ticket becomes reserved and the price edit is
  rejected.
- A stale read cannot allow both operations to succeed against the old state.

Reservation, release, and sale transitions are completed in the purchase,
expiration, and payment worksheets.

## Completion check

- Every valid listing starts as available with one immutable owner.
- Invalid or repeated creation cannot expose partial or duplicate listings.
- Only the owner may edit the price.
- Reserved and sold tickets reject editing.
- Price edit and reservation races have exactly one winner.
- Existing order amounts never follow later price edits.
