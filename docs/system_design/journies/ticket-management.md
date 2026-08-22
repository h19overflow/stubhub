# Ticket Management Journey — Step 1

**Status:** Drafted.

This journey records listing creation and price editing as separate user actions.
Any signed-in user may list or purchase tickets; there is no separate seller
role.

## Create a listing

```text
Action selected:
Create a ticket listing.

Actor:
A signed-in user who wants to list a ticket for sale.

Starting condition:
The user is signed in and chooses the action to list a ticket.

Information the actor provides:
- An image.
- A description.
- Relevant event dates and times.
- Additional ticket or event information.
- A price.

Successful outcome:
- The listing is owned by the user who created it.
- The listing becomes available and appears in the ticket marketplace.
- The owner can inspect the listing and remains allowed to purchase it.

Reasons the action should be rejected:
- The user is not signed in.
- Required ticket information is missing or invalid.
- The price is invalid.

What existing behavior must remain unchanged:
Creating a listing does not alter any existing listing, reservation, or order.
```

## Edit a listing

```text
Action selected:
Edit the price of an existing ticket listing.

Actor:
The signed-in owner of the listing.

Starting condition:
The listing exists, belongs to the user, and is available rather than reserved
or sold.

Information the actor provides:
A new valid price.

Successful outcome:
- The listing keeps the same owner and ticket identity.
- Later marketplace and detail views show the new price.
- Any future purchase begins using the new price.

Reasons the action should be rejected:
- The user is not signed in.
- The listing does not exist or belongs to another user.
- The new price is invalid.
- The ticket is reserved by a pending order.
- The ticket has already been sold.

What existing behavior must remain unchanged:
- An existing pending order keeps the price captured when that order began.
- Editing cannot remove or alter an active reservation.
- If an edit and purchase begin at the same time, only one action wins: a
  completed reservation rejects the edit, while a completed edit supplies the
  price captured by the later reservation.
```
