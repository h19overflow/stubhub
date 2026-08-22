# Payment State-Machine Worksheet

**Status:** Completed example.

Payment uses the Order lifecycle plus one Payment Attempt lifecycle inside the
Orders boundary. A failed attempt and a failed order are not the same thing.

## Order lifecycle

```text
Machine selected:
Order lifecycle

Business entity:
Order

Authoritative owner:
Orders Service

Relevant invariants:
PAY-1, PAY-2, PAY-3, PAY-4, PAY-5, PAY-6, PAY-7, PAY-9

Initial state:
pending

Active states:
pending, payment_processing

Terminal states:
complete, expired

Data that is not state:
userId, ticketId, captured amount, expiresAt, current paymentAttemptId
```

### Order transitions

| From | Trigger | Guard | To | User-visible outcome | Retry behavior |
|---|---|---|---|---|---|
| pending | Submit payment | User owns the order; deadline has not passed; matching reservation exists | payment_processing | Payment is shown as processing | Reuse the same logical attempt while it is unresolved |
| payment_processing | Payment is confirmed | Attempt is verified successful and no success was recorded before | complete | Purchase confirmation is shown | Return the existing completed order |
| payment_processing | Payment fails | Failure is confirmed and reservation time remains | pending | Failure is shown and payment may be retried | The failed attempt stays failed; a later retry creates a new attempt |
| payment_processing | Payment fails after the deadline | Failure is confirmed and the deadline has passed | expired | Payment cannot continue; purchase must restart | Return the existing expired order |

An uncertain payment result leaves the order in `payment_processing`. It is not
silently treated as success, failure, or expiration.

## Payment Attempt lifecycle

```text
Machine selected:
Payment Attempt lifecycle

Business entity:
Payment attempt

Authoritative owner:
Orders Service through its Payments module

Relevant invariants:
PAY-3, PAY-4, PAY-5, PAY-6, PAY-10

Initial state:
processing

Active states:
processing

Terminal states:
succeeded, failed

Data that is not state:
paymentAttemptId, orderId, captured amount, safe provider reference,
non-sensitive failure information
```

### Payment Attempt transitions

| From | Trigger | Guard | To | Effect on Order | Retry behavior |
|---|---|---|---|---|---|
| No attempt | Valid payment submission | Order entered payment_processing | processing | None until the result is known | Reuse this attempt for the same submission |
| processing | Verified acceptance | Attempt has no prior terminal result | succeeded | Order may transition to complete | Duplicate acceptance causes no second charge or completion |
| processing | Verified decline or failure | Attempt has no prior terminal result | failed | Order returns to pending or expires according to its deadline | Duplicate failure causes no further change |

Raw card number, card expiry, and security code are never state-machine data and
are never stored or logged by the application.

## Deadline rule

The 15-minute deadline is the cutoff for submitting payment:

- Submission before the deadline moves the order to `payment_processing`.
- While that attempt is unresolved, expiration cannot release the ticket.
- Confirmed success completes the order even if the result arrives after the
  displayed countdown reaches zero.
- Confirmed failure returns to `pending` only when time remains; otherwise the
  order becomes `expired`.

## Completion and Ticket sale

| Order outcome | Required Ticket outcome |
|---|---|
| complete | The matching reserved ticket becomes sold |
| pending after decline | The matching ticket remains reserved until the deadline |
| expired after failure | The matching ticket reservation is released |

Tickets Service permits `reserved -> sold` only when `lockedByOrderId` matches
the completed order. A delayed or duplicate completion cannot sell another
order's ticket.

## Partial failure and unknown results

| Failure | Required result |
|---|---|
| Payment accepted but the response is lost | Keep one processing attempt and reconcile its result; do not charge again |
| Payment attempt succeeds but recording order completion fails | Keep the ticket reserved and retry reconciliation until the order is complete |
| Order completes but marking the ticket sold fails | Retry the guarded sale; expiration must not release the completed order's reservation |
| Browser closes during processing | Backend processing and reconciliation continue without browser authority |

## Forbidden transitions

```text
complete -> payment_processing
complete -> expired
expired -> payment_processing
expired -> complete
succeeded Payment Attempt -> failed
failed Payment Attempt -> succeeded
```

## Completion check

- Only the authenticated order owner can submit payment.
- The charged amount comes only from the order snapshot.
- One order has at most one successful charge and completion.
- Declined and uncertain results remain distinct.
- On-time processing prevents premature expiration and release.
- Complete and expired are mutually exclusive terminal outcomes.
- Completed orders converge to matching sold tickets.
