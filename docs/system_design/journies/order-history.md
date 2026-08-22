# Order History Journey — Step 1

**Status:** Drafted.

This journey records how a signed-in user reviews their active and completed
purchase orders. Viewing order history does not change any order or ticket state.

```text
Actor:
A signed-in user who wants to review tickets they are purchasing or have
successfully purchased.

Starting condition:
The user is signed in and chooses My Orders.

Information the actor wants:
- A recognizable summary of the ticket for each order.
- The amount captured when the order began.
- Whether the order is pending or complete.
- The remaining reservation time for a pending order.
- Whether a pending order can still continue to payment.

Successful outcome:
- The user sees only their own orders.
- The user can distinguish active pending orders from completed purchases.
- Selecting an order shows its ticket, captured amount, status, and remaining
  time when applicable.
- Later ticket edits do not change the amount or status shown for an existing
  order.

Orders that should be included:
- Active pending orders whose tickets are still reserved for the user.
- Completed orders for tickets the user successfully purchased.
- An order where the user bought their own listing, because ownership does not
  prevent purchase.

Orders that must not be included:
- Orders belonging to another user.
- Listings the user created but never attempted to purchase.
- Expired or cancelled orders in the initial My Orders view.
- Duplicate entries for repeated purchase or payment attempts.

Outcome when there are no orders:
The user sees a clear empty state explaining that they have no active or
completed orders and can return to the ticket marketplace.

Additional behavior:
- A pending order shows its countdown and allows payment only while it remains
  active.
- A completed order cannot be paid again.
- An order remains understandable even if its ticket is later edited or removed
  from the marketplace.
- Changing or guessing an order identifier must never reveal another user's
  order.
```
