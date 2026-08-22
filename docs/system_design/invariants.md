# Business Invariants — Step 2

**Status:** Drafted from the completed business journeys.

These rules must remain true when requests are repeated, concurrent, late, or
interrupted. The authoritative owner makes the business decision and protects
its state. Other components may display or coordinate that decision, but they
must not become a second authority.

## Identity access

| ID | Invariant | Authoritative owner |
|---|---|---|
| IA-1 | An email identity can belong to at most one account. Repeating the same sign-up attempt must not create duplicate accounts. | Identity Service |
| IA-2 | Only credentials accepted by Identity may establish an authenticated user, and the resulting identity represents exactly one `userId`. | Identity Service |
| IA-3 | Missing, invalid, signed-out, or expired authentication must never authorize a protected action. A caller-supplied identifier cannot impersonate another user. | Identity Service |
| IA-4 | A rejected sign-in must not reveal whether the email or the password was incorrect. | Identity Service |
| IA-5 | A failed or interrupted sign-up or sign-in must not leave the user partially authenticated. | Identity Service |

## Ticket discovery

| ID | Invariant | Authoritative owner |
|---|---|---|
| TD-1 | Only a ticket currently marked available may be presented as purchasable. A stale list or detail view never authorizes purchase. | Tickets Service |
| TD-2 | A ticket with an active reservation or a sold ticket must not appear in available-ticket results or accept a direct purchase attempt. | Tickets Service |
| TD-3 | Viewing, filtering, or inspecting a ticket must not reserve it or change its availability. | Tickets Service |
| TD-4 | Ticket details may expose seller information intended for the marketplace, but never seller credentials or private identity data. | Tickets Service |

## Ticket management

| ID | Invariant | Authoritative owner |
|---|---|---|
| TM-1 | Any authenticated user may create a listing; there is no separate seller role. Every created listing has exactly one owner, assigned from the authenticated identity. | Tickets Service |
| TM-2 | A listing cannot become available without its required image, description, event information, and a valid price. | Tickets Service |
| TM-3 | Retrying one interrupted listing-creation request must not create multiple listings for that same request. A rejected creation must not expose a partial listing. | Tickets Service |
| TM-4 | Only the listing owner may edit its price, and ownership cannot be changed through a price edit. | Tickets Service |
| TM-5 | A reserved or sold ticket cannot be edited. A rejected edit changes neither the listing nor its reservation. | Tickets Service |
| TM-6 | Price editing and reservation compete as one authoritative decision: if reservation wins, the edit is rejected; if the edit wins, the later reservation observes the new price. | Tickets Service |

## Ticket purchase

| ID | Invariant | Authoritative owner |
|---|---|---|
| TP-1 | An authenticated user may attempt to purchase any available ticket, including their own listing. | Orders Service |
| TP-2 | A ticket can have at most one active reservation. Concurrent buyers cannot both win the same ticket. | Tickets Service |
| TP-3 | Every active ticket reservation identifies exactly one order. Only that matching order may complete or release the reservation. | Tickets Service |
| TP-4 | A successful purchase start produces one logical pending order for the buyer. Retrying the same purchase request must not create additional active orders. | Orders Service |
| TP-5 | A pending order is payable only while the ticket has the matching active reservation for that order. | Orders Service |
| TP-6 | The order amount is captured from the price accepted by the successful reservation and cannot change because of a later ticket edit. | Orders Service |
| TP-7 | A rejected purchase attempt creates no payable order and gives the rejected buyer no reservation. | Orders Service |
| TP-8 | An interrupted reservation flow must recover to one valid outcome: a pending order with its matching reservation, or no payable order with no permanent orphan reservation. | Orders Service |
| TP-9 | Every pending order has a durable authoritative deadline. A browser countdown or process memory is never the authority. | Orders Service |

## Payment

| ID | Invariant | Authoritative owner |
|---|---|---|
| PAY-1 | Only the authenticated owner of an eligible pending order may pay it. Complete and expired orders are never payable. | Orders Service |
| PAY-2 | The amount submitted for payment comes from the order price snapshot. The client cannot choose or alter the amount, user, ticket, or order state being charged. | Orders Service |
| PAY-3 | One order can have at most one successful charge and one successful transition to complete, despite retries or duplicate payment results. | Orders Service |
| PAY-4 | Provider acceptance alone does not make the purchase complete; Orders must confirm that the order is still eligible and record the complete outcome. | Orders Service |
| PAY-5 | A declined payment never completes the order. It may be retried only while the order remains pending and its reservation remains valid. | Orders Service |
| PAY-6 | An uncertain payment result must not be treated as either success or failure, retried blindly, or charged again until resolved. | Orders Service |
| PAY-7 | A payment submitted before the deadline and still resolving prevents expiration and ticket release until that attempt reaches a known outcome. | Orders Service |
| PAY-8 | A ticket may be marked sold only for the order that currently owns its reservation. A delayed or duplicate completion cannot sell a ticket reserved by another order. | Tickets Service |
| PAY-9 | A completed order must converge to a sold ticket. Failure to record the matching sold state must remain recoverable, and expiration must never release that completed order's reservation. | Orders Service |
| PAY-10 | Raw card numbers, card expiry details, and security codes must never be stored or logged by the application. | Orders Service |

## Expiration

| ID | Invariant | Authoritative owner |
|---|---|---|
| EX-1 | Only an eligible pending order whose durable deadline has passed may expire. An on-time payment still resolving is not eligible to expire. | Orders Service |
| EX-2 | Complete and expired are mutually exclusive terminal outcomes. Payment and expiration racing for one order cannot both win. | Orders Service |
| EX-3 | Expiration is automatic, survives process restarts, and is safe to consider repeatedly. Repetition cannot change a completed or already expired order. | Orders Service |
| EX-4 | An expired order can never return to pending or complete and can never be paid. | Orders Service |
| EX-5 | A release changes ticket availability only when the reservation still belongs to the expiring order. A delayed release from an older order cannot unlock a newer reservation. | Tickets Service |
| EX-6 | An expired order must not leave its matching ticket permanently unavailable. Release failure must remain recoverable until the matching reservation is released. | Orders Service |
| EX-7 | After the matching reservation is released, the ticket is eligible for purchase again unless it has since entered another valid unavailable state. | Tickets Service |

## Order history

| ID | Invariant | Authoritative owner |
|---|---|---|
| OH-1 | A user may read only orders owned by their authenticated `userId`; changing or guessing an identifier cannot reveal another user's order. | Orders Service |
| OH-2 | The initial My Orders view contains the user's active pending orders and completed purchases, without duplicate entries. Expired or cancelled orders are not included. | Orders Service |
| OH-3 | Every displayed order uses its captured amount. Later ticket-price edits never rewrite order history. | Orders Service |
| OH-4 | A pending order's remaining time comes from its authoritative deadline. A completed order has no payable countdown and cannot be paid again. | Orders Service |
| OH-5 | Reading order history never changes an order, payment, reservation, or ticket state. | Orders Service |
| OH-6 | A completed order remains visible and understandable even if its ticket is later edited or removed from the marketplace. | Orders Service |

## Retry, race, and failure audit

| Pressure | Invariants that protect the business result |
|---|---|
| Repeated sign-up or authentication interruption | IA-1, IA-2, IA-5 |
| Repeated or interrupted listing creation | TM-2, TM-3 |
| Unauthorized or late price edit | TM-4, TM-5 |
| Stale discovery page followed by direct purchase | TD-1, TD-2, TP-2 |
| Two buyers attempt the same ticket | TP-2, TP-4, TP-7 |
| Price edit races with reservation | TM-5, TM-6, TP-6 |
| Reservation succeeds but order creation or the response fails | TP-4, TP-5, TP-8 |
| Purchase request is retried after an unknown result | TP-2, TP-4, TP-8 |
| Payment request or provider result is duplicated | PAY-2, PAY-3, PAY-6 |
| Payment is declined or its result is unknown | PAY-5, PAY-6, PAY-7 |
| Payment confirmation races with expiration | PAY-4, PAY-7, TP-9, EX-1, EX-2 |
| Order completes but recording the ticket as sold fails | PAY-8, PAY-9, EX-2, EX-5 |
| Expiration repeats after restart | EX-3, EX-4, EX-6 |
| Browser closes, restarts, or shows a stale countdown | TP-9, EX-1, EX-3, OH-4 |
| A delayed release arrives after another reservation | EX-5, EX-7 |
| Untrusted identifiers or public responses expose private data | IA-3, TD-4, PAY-10, OH-1 |
| Ticket details change or disappear after purchase | OH-3, OH-6 |

## Completion check

No known retry, race, or failure from the completed journeys depends on an
unrecorded business rule. Later design steps still need to choose the mechanisms
for request identity, cross-service recovery, durable expiration work, and
payment-result resolution; those mechanisms must enforce the invariants above
rather than redefine them.
