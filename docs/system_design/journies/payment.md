# Payment Journey — Step 1

**Status:** Drafted.

This journey records what the buyer observes while paying for an existing
pending order. The payment provider is an implementation detail.

```text
Actor:
A signed-in user with a pending order for a reserved ticket.

Starting condition:
- The ticket is reserved for the user's pending order.
- The order shows the exact amount to be paid.
- The payment page shows how much remains of the 15-minute reservation window.

Action the actor takes:
The user enters their payment information and submits the payment before the
reservation deadline.

Successful outcome:
- The payment is confirmed once.
- The pending order becomes complete.
- The ticket is sold and cannot be purchased by another user.
- The timer stops and the user sees a purchase confirmation.

Reasons payment should not be attempted:
- The user is no longer signed in.
- The pending order does not exist or does not belong to the user.
- The order is already complete or expired.
- The ticket is no longer reserved for this order.
- The reservation deadline passed before the payment was submitted.

Outcome when payment is declined:
- The order does not become complete.
- If reservation time remains, the order stays pending, the ticket remains
  reserved, and the user may try payment again.
- If the reservation deadline has passed, the order expires, the ticket becomes
  available again, and the user must restart the purchase.

Outcome when the result is uncertain:
- The user sees that the payment is processing and is not asked to submit a
  duplicate payment.
- A payment submitted before the deadline is allowed to finish resolving before
  the ticket is released.
- If that payment is confirmed, the order becomes complete.
- If it fails, the user may retry only when reservation time remains; otherwise,
  the order expires and the ticket becomes available again.

State outcomes:
- Pending order + payment submitted before deadline -> payment processing.
- Pending order + deadline reached before submission -> order expired and
  ticket released.
- Payment processing + payment confirmed -> order complete and ticket sold.
- Payment processing + payment declined with time remaining -> order pending
  and payment may be retried.
- Payment processing + payment declined after deadline -> order expired and
  ticket released.
- Payment processing + result not yet known -> remain processing without
  charging again or releasing the ticket prematurely.
```
