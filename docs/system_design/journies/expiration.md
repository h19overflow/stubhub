# Expiration Journey — Step 1

**Status:** Drafted.

This journey records the business outcome when a pending order reaches its
15-minute reservation deadline without completing payment.

```text
Triggering condition:
The reservation deadline is reached while the order is still pending and no
payment submitted before the deadline is still being resolved.

Starting condition:
- A pending order exists for the buyer.
- The ticket is temporarily reserved for that order.
- The order has not been completed or expired already.

Required outcome:
- The pending order becomes expired.
- The expired order can no longer be paid.
- The ticket reservation is released only if it still belongs to that order.
- The ticket becomes available for another purchase.
- Reconsidering the same expiration does not change the result.

What the buyer observes:
- The countdown reaches zero.
- The payment action is no longer available.
- The buyer is told that the reservation expired.
- The buyer must restart the purchase if the ticket is still available.
- Reloading the page does not restore the expired order or reservation.

What another buyer observes:
The ticket becomes available again and another buyer may begin a new purchase.

Conditions where expiration must do nothing:
- The reservation deadline has not been reached.
- The order completed before the deadline.
- The order is already expired.
- A payment submitted before the deadline is still being resolved.
- The ticket is no longer reserved for this order; expiration of an older order
  must not release a newer reservation.

Related payment outcomes:
- A declined payment leaves the order pending while reservation time remains.
- If that time runs out without a successful payment, the order expires.
- A payment confirmed before the deadline completes the order, so expiration
  does not release the ticket.
- An on-time payment still being processed must resolve before the ticket can be
  released.
```
