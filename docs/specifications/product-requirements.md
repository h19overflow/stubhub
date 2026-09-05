# Ticket Marketplace Product Requirements

## Purpose

This is the nontechnical product document for the ticket marketplace described
in the supplied course brief. It defines what the application must do, what a
user must experience, and what is outside the first product boundary.

It does not choose service boundaries, databases, event-bus products, API
routes, authentication mechanisms, or AWS resources. Those belong in
`technical-requirements.md` and must be designed deliberately.

## 1. Product definition

The application is a smaller ticket marketplace inspired by StubHub. Users list
individual tickets for concerts, sporting events, and similar occasions. Other
registered users can purchase those tickets.

The important product problem is contention. Several users may try to purchase
the same ticket at nearly the same time. Purchase intent must temporarily
protect the ticket while the buyer enters payment information, and a second
user must not be allowed to buy the same ticket during that protection period.

The product focuses on ticketing. It is not a complete StubHub clone and does
not need StubHub's full event-discovery model.

## 2. Product boundary

### Included in the first product

- Email/password account creation.
- Sign-in and sign-out.
- A marketplace view of tickets for sale.
- Ticket listing creation.
- Ticket detail with price and availability.
- Ticket price editing while the ticket is not locked.
- Purchase intent that locks a ticket for fifteen minutes.
- A countdown for the buyer holding the lock.
- Hiding a locked ticket from other users' available-ticket views.
- Automatic expiration and unlock after the lock period.
- Orders for both active purchase attempts and completed purchases.
- Stripe-backed payment.
- A browser flow matching the supplied mockups at a functional level.
- Behavior that remains correct when purchase, editing, payment, and expiration
  happen concurrently.

### Explicitly not included

- A complete event catalog.
- Multiple dates or performances for an event.
- Venue maps, sections, rows, or seat visualization.
- Search ranking, recommendations, or saved events.
- Seller or buyer ratings.
- Buyer/seller messaging.
- Administrative roles or moderation workflows.
- Seller payouts.
- Refunds, transfers, or partial orders.
- A mobile application.

These features can be added later only as explicit requirements.

## 3. Users and permissions

There is one normal user type. Every registered user can:

- list a ticket;
- edit the price of an unlocked ticket they own;
- browse available tickets;
- attempt to purchase a ticket;
- purchase their own ticket if they choose;
- view their own orders;
- pay for an active order; and
- sign out.

There is no special seller role and no special buyer role in the source brief.
An unauthenticated visitor can see the public marketplace surface and can
choose Sign up or Sign in, but protected actions require authentication.

## 4. Product concepts

- **User:** a registered account identified by email and password.
- **Event:** the concert, sport, or other occasion associated with a listing.
- **Ticket:** the individual item listed for sale.
- **Lock:** the temporary protection created when a buyer chooses Purchase.
- **Order:** the buyer's record from purchase intent through completion,
  expiration, or cancellation.
- **Payment:** the Stripe-backed attempt to complete an order.

The exact field names, identifiers, status labels, and screens are technical or
interaction design details. The behavior in this document is the requirement.

## 5. Source requirements

### R-01 — Any registered user can sell

A user who signs up can list tickets for sale. There is no privileged seller
role in the described product.

### R-02 — Any registered user can buy

A registered user can purchase a listed ticket. There is no privileged buyer
role.

### R-03 — Self-purchase is allowed

The brief explicitly says a user may purchase one of their own tickets. The
product must not add an owner-versus-buyer exclusion rule.

### R-04 — Listings represent event tickets

A listing is associated with an event such as a concert or sporting event. The
brief does not require a separate event catalog, event dates, or seat maps.

### R-05 — Available tickets are discoverable

The landing page displays tickets currently for sale. Visitors can see the
marketplace and the header provides Sign up and Sign in actions.

### R-06 — Tickets have prices

Ticket detail shows the price. The owner can edit the price while the ticket is
not locked.

### R-07 — Purchase starts a lock

Choosing Purchase, equivalent to StubHub's Go to checkout action, expresses
intent to buy. It is not yet completed payment.

The ticket is locked for fifteen minutes at that point so the buyer can enter
payment information.

### R-08 — A locked ticket is unavailable to other users

While locked, no other user can purchase the ticket. It is also removed from
other users' available-ticket results.

The user holding the lock can continue checkout and see the remaining time.

### R-09 — Locks expire automatically

After fifteen minutes, the lock ends automatically if the order did not
complete. The ticket becomes available again.

A thirty-second lock is allowed for local manual verification because the source
author used that duration to make testing easier. Fifteen minutes remains the
product/default duration.

### R-10 — Payment completes an order

The buyer can choose Pay from the locked checkout screen. The source calls for
Stripe and describes real card numbers and real money in theory. Payment data
must therefore be treated as sensitive, and raw card details must not be stored
by this application.

### R-11 — Users can view My Orders

My Orders lists tickets the current user is trying to purchase and tickets the
user successfully purchased. A locked ticket appears as an order before
payment completes.

### R-12 — Authentication is production-grade

Users can sign up with email and password, sign in, and sign out. After
authentication, the header exposes actions such as selling tickets and viewing
orders. The source explicitly says not to repeat the shortcuts from the earlier
application.

### R-13 — Persistence is real

The application uses real databases instead of the earlier in-memory approach.
The database product and ownership model are deliberately unspecified here.

### R-14 — Events use a real event bus

The application uses a more production-grade event bus than the homemade bus
from the earlier application. The product, contracts, delivery semantics, and
retry behavior are technical design decisions.

### R-15 — Concurrent changes are intentional

The system must define what happens when a buyer attempts to lock a ticket at
the same time its owner edits the price. This is a central product behavior,
not an incidental edge case.

## 6. User-visible surfaces

### Public landing page

- Displays tickets currently for sale.
- Does not show tickets locked by another user.
- Provides Sign up and Sign in.
- Does not need StubHub-style event/date navigation.

### Authenticated landing page

- Continues to display available tickets.
- Updates the header after authentication.
- Provides Sign out.
- Provides an action to sell/list a ticket.
- Provides an action to open My Orders.

### Ticket detail

- Shows the event/listing identity.
- Shows the price.
- Shows availability.
- Provides Purchase when the user may attempt checkout.
- Does not allow a second buyer to purchase a ticket already locked by another
  user.

### Create/edit listing

The source mockups do not show these screens, but the product requires them.
The user must be able to create a listing and the owner must be able to edit its
price while it is not locked. Exact fields remain open until interaction design
is chosen.

### Locked checkout

- Shows the selected ticket.
- Shows the price used for this checkout.
- Shows the remaining lock time.
- Provides Pay.
- Makes the current order visible in My Orders.
- Ends payment access when the lock expires.

### Payment screen or modal

- Collects the information required by the selected Stripe flow.
- Shows success or failure clearly.
- Does not expose or persist raw card details in application storage.

### My Orders

- Lists active locked orders.
- Lists completed purchases.
- Shows the ticket, amount, status, and remaining time when applicable.
- Does not expose another user's orders.
- Does not leave expired or completed orders payable.

## 7. User journeys and acceptance criteria

### 7.1 Sign up

1. A visitor opens the application.
2. They choose Sign up.
3. They submit an email and password.
4. Valid input creates an account when the email is not already registered.
5. The user becomes authenticated or receives a clear next step to sign in.
6. The header exposes authenticated actions.

Acceptance:

- Invalid input is rejected clearly.
- A duplicate account does not create a second account.
- Password material is never shown back to the user.
- An authenticated request can be associated with the created user.

### 7.2 Sign in and sign out

1. A visitor chooses Sign in and submits credentials.
2. Valid credentials authenticate the user.
3. Invalid credentials do not authenticate the user.
4. An authenticated user chooses Sign out.
5. Protected access is removed and the header returns to Sign up/Sign in.

Acceptance:

- The account can sign in again after signing out.
- Errors do not reveal whether only the email or password was wrong.
- Unauthenticated users cannot list, purchase, view private orders, or pay.

### 7.3 Create a listing

1. An authenticated user chooses the sell/list action.
2. They enter the required event information and ticket price.
3. Valid input is stored.
4. The listing becomes available for purchase.
5. The listing appears in the marketplace.

Acceptance:

- An unauthenticated user cannot create a listing.
- A created listing has an owner and a price.
- The owner can see it.
- The owner remains eligible to purchase it.

### 7.4 Edit a listing

1. The owner opens an available listing.
2. They change its price.
3. The application accepts the change while it is not locked.
4. Later reads show the new price.

If a buyer holds the lock, the owner edit is rejected. It must not silently
change the amount already associated with that buyer's active checkout.

Acceptance:

- A non-owner cannot edit the listing.
- An active order's price does not change because of a later edit.
- A simultaneous edit and purchase has one deterministic documented outcome.

### 7.5 Browse and view detail

1. A visitor or authenticated user opens the landing page.
2. Available tickets are returned.
3. Tickets locked by another user are absent.
4. The user opens a ticket detail view.
5. The detail view shows identity, price, and availability.

If a ticket becomes unavailable between browsing and detail/purchase, the user
receives a clear unavailable result rather than a false checkout success.

### 7.6 Purchase and lock

1. An authenticated user chooses Purchase.
2. The application records purchase intent.
3. The ticket becomes locked for fifteen minutes.
4. The user reaches locked checkout.
5. The countdown shows remaining time.
6. Other users can no longer discover or purchase it as available.
7. The current user can choose Pay.

Acceptance:

- Two users cannot both obtain a valid lock for one ticket.
- A losing request does not create a usable order.
- Retrying the same request does not create duplicate active intent.
- The buyer can retrieve their order and remaining time.
- Checkout uses the price captured at lock time.
- The owner can purchase their own ticket.

### 7.7 Expiration

1. A user locks a ticket.
2. Payment is not completed before the deadline.
3. The lock expires without a browser tab remaining open.
4. The order becomes expired or otherwise no longer payable.
5. The ticket becomes available again.
6. Another user can discover and purchase it.

Acceptance:

- A process restart does not create an infinite lock.
- Late payment cannot complete the expired order.
- Repeated expiration processing is safe.

### 7.8 Payment

1. The buyer chooses Pay from an active order.
2. The selected Stripe flow starts.
3. The buyer enters payment information.
4. The application confirms the order and amount.
5. Successful payment marks the order complete.
6. The ticket is no longer available.
7. The completed order appears in My Orders.

Acceptance:

- A user cannot pay another user's order.
- Payment cannot complete after expiration.
- A client cannot change the amount.
- Raw card number, expiration, and security code are not stored or logged.
- Payment retries cannot create multiple completed purchases.
- Stripe failure is displayed and follows the chosen recovery/expiration path.

### 7.9 My Orders

1. An authenticated user opens My Orders.
2. Active locked orders and completed purchases are listed.
3. Selecting an order shows its ticket, amount, status, and remaining time when
   applicable.

Acceptance:

- Changing an identifier cannot reveal another user's order.
- A pending order has a valid deadline.
- A complete order cannot be paid again.
- Expired/cancelled orders are not payably active.

## 8. Observable race rules

| Simultaneous actions | Required product result |
|---|---|
| Two users purchase one available ticket | Exactly one lock succeeds |
| Purchase and seller price edit | One deterministic result; no silent price mismatch |
| Purchase and listing read | A stale read cannot authorize a purchase |
| Expiration and payment | One terminal outcome; never paid after expiration |
| Payment retry | At most one completed purchase |
| Browser retry of Purchase | One logical active intent/order |

The technical implementation must explain how these outcomes are guaranteed.
The product document does not choose the mechanism.

## 9. Manual acceptance journey

Use two accounts, two browser sessions, and a thirty-second local lock:

1. Create accounts A and B.
2. Sign in as A and create a ticket.
3. Confirm B can see it.
4. Have A choose Purchase.
5. Confirm A sees the countdown and My Orders entry.
6. Confirm B cannot see or purchase the locked ticket.
7. Attempt a seller price edit while locked and confirm rejection.
8. Let the lock expire without paying.
9. Confirm B can see and purchase the ticket.
10. Repeat with a safe Stripe test payment.
11. Confirm the ticket is no longer available and the order is complete.
12. Repeat Purchase rapidly from both sessions and record one winner.

## 10. Success definition

The first complete product is successful when a user can sign up, list a ticket,
see it in the marketplace, start checkout, observe the timed lock, complete
payment, and see the resulting order, while a concurrent second attempt cannot
purchase the same locked ticket. An unpaid lock must become available again
when the configured period ends.

## 11. Product questions still open

The brief does not define:

- Exact listing fields beyond event association and price.
- Exact wording and visual design.
- Whether expired/cancelled orders are hidden or shown in history.
- Refund, cancellation, and post-payment support behavior.
- Seller payout behavior.
- Any event-catalog behavior beyond the minimum listing information.

These are product decisions to make later, not assumptions to smuggle into the
first implementation.
