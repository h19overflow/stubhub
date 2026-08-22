# Ticket Discovery State-Machine Worksheet

**Status:** Completed example.

Ticket discovery does not own a state machine. It reads the Ticket lifecycle and
changes no durable business state.

## Machine observed

```text
Machine selected:
Ticket lifecycle, read-only from this journey

Business entity:
Ticket

Authoritative owner:
Tickets Service

Relevant invariants:
TD-1, TD-2, TD-3, TD-4

States observed:
available, reserved, sold

Data that is not state:
ownerId, image, description, event information, price, lockedByOrderId,
reservation deadline
```

## State visibility

| Ticket state | Appears in available index | Details may be viewed | Purchase action |
|---|---|---|---|
| available | Yes | Yes | Enabled |
| reserved | No | A direct or stale page may show it as unavailable | Disabled |
| sold | No | A direct or stale page may show it as unavailable | Disabled |

Only public seller information is shown. Seller credentials and private identity
data are never part of ticket discovery.

## Deliberate non-transitions

| User action | Result | Ticket state change |
|---|---|---|
| Open ticket index | Available tickets are displayed | None |
| Apply or clear filters | The visible result set changes | None |
| Open a ticket card | Ticket details are displayed | None |
| Return to the index | The index is displayed | None |

## Stale and failure outcomes

| Situation | Required result | State change |
|---|---|---|
| Ticket becomes reserved after the index loads | A purchase attempt rechecks current availability and is rejected | None from discovery |
| Ticket becomes sold while details are open | The purchase action is disabled or rejected as unavailable | None from discovery |
| No tickets match filters | Show an empty filtered result and allow filters to be cleared | None |
| Ticket does not exist | Show not found | None |
| Ticket information cannot be loaded | Show a temporary failure rather than claiming no tickets exist | None |

## Completion check

- Discovery observes the Ticket lifecycle rather than creating another machine.
- Available, reserved, and sold tickets have explicit visibility rules.
- Stale reads cannot authorize purchase.
- Viewing and filtering never reserve or mutate a ticket.
- Public ticket details do not expose private seller identity data.
