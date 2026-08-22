# Ticket Purchase Journey — Step 1

**Status:** Drafted.

This journey records what the person observes when beginning the purchase of one
ticket. Payment starts only after the ticket has been reserved successfully.

```text
Actor:
A signed-in user who wants to purchase a specific ticket.

Starting condition:
The user is on the ticket details page, can see the ticket information, and sees
an enabled action to continue to payment. The ticket appears to be available.

Action the actor takes:
The user selects the action to continue to payment.

Successful outcome:
- A pending order is created for the user.
- The ticket is reserved temporarily for that pending order.
- Other users cannot purchase or reserve the ticket during that reservation.
- The user reaches the payment page and can see that the reservation is
  temporary.

Reasons the request should be rejected:
- The user is no longer signed in.
- The ticket no longer exists.
- The ticket has already been sold.
- The ticket is already reserved by another pending order.

What the actor observes after rejection:
- If the user is not signed in, they are prompted to sign in before trying
  again.
- If the ticket is no longer available, the user is told that the purchase
  cannot begin and cannot continue to payment.
- A rejected attempt does not create a pending order or reserve the ticket
  for that user.
- If two users try to purchase the same ticket, only one can begin successfully;
  the other sees that the ticket is unavailable.

Outcome when the buyer does not continue:
The reservation expires after its allowed time. The pending order can no longer
be paid, and the ticket becomes available again.
```
