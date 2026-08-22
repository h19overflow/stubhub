# Order History State-Machine Worksheet

**Status:** Completed example.

Order history does not own a state machine. It reads the Order lifecycle and
changes no Order, Payment Attempt, reservation, or Ticket state.

## Machine observed

```text
Machine selected:
Order lifecycle, read-only from this journey

Business entity:
Order

Authoritative owner:
Orders Service

Relevant invariants:
OH-1, OH-2, OH-3, OH-4, OH-5, OH-6

States observed:
pending, payment_processing, complete, expired

Data that is not state:
userId, ticketId, captured amount, expiresAt, recognizable ticket information
```

## State presentation

| Order state | Included in initial My Orders | Amount shown | Time or status shown | Allowed action |
|---|---|---|---|---|
| pending | Yes | Captured order amount | Remaining reservation time | Pay while the authoritative deadline remains valid |
| payment_processing | Yes | Captured order amount | Payment processing | No duplicate Pay action |
| complete | Yes | Captured order amount | Complete | View purchase details only |
| expired | No | Not shown in the initial view | Not applicable | None |

Completed orders and active orders remain distinct. A complete order never shows
a payment action or payable countdown.

## Deliberate non-transitions

| User action | Required result | Domain state change |
|---|---|---|
| Open My Orders | Display the authenticated user's included orders | None |
| Select an order | Display its ticket, amount, current status, and applicable time | None |
| Refresh an order | Display the latest authoritative Order state | None |
| Return to marketplace | Display available tickets | None |

## Authorization and privacy

- Orders Service returns only orders owned by the authenticated `userId`.
- Guessing or changing an order identifier cannot expose another user's order.
- Owning the listed ticket does not grant access to another buyer's order.
- Public ticket information does not broaden access to payment or order details.

## Ticket changes after order creation

- The displayed amount always comes from the Order snapshot.
- A later ticket price edit cannot rewrite a pending or completed order amount.
- A completed order remains visible and understandable if the listing changes or
  disappears from the marketplace.
- The later data-design step will decide which identifying ticket details must be
  captured versus read from Tickets.

## Stale and failure outcomes

| Situation | Required result | State change |
|---|---|---|
| Pending order expires while displayed | Refresh shows it as expired and removes it from the initial view | None caused by history |
| Payment completes while displayed | Refresh shows the order as complete | None caused by history |
| Remaining-time display becomes stale | A payment attempt rechecks authoritative eligibility | None caused by history |
| Order retrieval temporarily fails | Show a temporary failure, not an empty-history claim | None |
| User has no included orders | Show the genuine empty state and marketplace action | None |

## Completion check

- Order history observes rather than owns the Order lifecycle.
- Pending, processing, complete, and expired have explicit presentation rules.
- Only the authenticated user's orders are visible.
- Captured amounts do not follow later ticket edits.
- Stale display cannot authorize payment.
- Reading order history causes no domain transition.
