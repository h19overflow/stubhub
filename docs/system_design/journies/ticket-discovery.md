# Ticket Discovery Journey — Step 1

**Status:** Drafted.

This journey records what the person does and observes while finding and
inspecting a ticket. Choosing to buy starts the separate purchase journey.

```text
Actor:
A signed-in user looking for a ticket.

Starting condition:
The user is signed in and is on the tickets index page.

Information the actor wants:
- Which tickets are available.
- Enough information on each ticket card to decide which one to inspect.
- The selected ticket's image, description, relevant dates and times,
  additional information, price, and seller information.

Action the actor takes:
- The user reviews the ticket cards shown on the index page.
- The user may filter the tickets to narrow the results.
- The user selects a ticket card to open its details page.
- After reviewing the details, the user may choose to begin purchasing the
  ticket.

Successful outcome:
The user can find a relevant ticket, inspect its details, and decide whether to
return to the ticket list or begin the purchase journey. Viewing or filtering
tickets does not reserve them or change their availability.

Reasons no result should be shown:
- No tickets are currently listed.
- No tickets match the selected filters.
- The selected ticket no longer exists.
- Ticket information is temporarily unavailable.

What the actor observes when a ticket is unavailable:
- When no tickets match the filters, the user sees a clear empty state and can
  change or clear the filters.
- When the selected ticket no longer exists, the user is told that it could not
  be found and can return to the ticket list.
- When the ticket still exists but cannot be purchased, its details identify it
  as unavailable and the purchase action is disabled.
- When ticket information cannot be loaded, the user sees a temporary error and
  can try again.
- If availability changes while the details page is open, the current
  availability is checked when the user chooses to begin purchasing.
```
