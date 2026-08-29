# Commerce Interaction Flows — Step 4

**Status:** Proposed design for review. This is not yet an accepted contract.

## Purpose and reading rules

These flows put the accepted journeys, invariants, and state machines into chronological order without choosing communication, interface, messaging, or persistence mechanisms.

Every row names exactly one decision owner. A state change of **None** is deliberate. The Frontend Client may present state and collect intent, but only Tickets decides Ticket availability and only Orders decides Order lifecycle, payment eligibility, and expiration. Payments and expiration are capabilities inside Orders, not separate services.

## 1. Ticket discovery

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Visitor or signed-in user | Open the marketplace or change discovery filters. | Tickets Service | None | Return only Tickets currently `available`; a genuine empty result is distinguishable from a temporary failure. | A read may become stale immediately and cannot authorize purchase. |
| 2 | Visitor or signed-in user | Open one Ticket. | Tickets Service | None | Show its current public listing information, price, and `available`, `reserved`, or `sold` status without private seller identity data. | A missing Ticket is shown as not found; an unavailable Ticket remains inspectable but not purchasable. |
| 3 | Frontend Client | Present the purchase affordance from the observed state. | Frontend Client | None | Enable it only for an apparently available Ticket; require sign-in before a protected purchase action. | Client presentation is advisory. Tickets rechecks availability when purchase begins. |

## 2. Create an owned listing

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Signed-in user | Provide the required image, listing information, event timing, place, and price. | Frontend Client | None | Preserve the entered values and identify obvious input problems for immediate feedback. | Client validation is not authoritative. |
| 2 | Signed-in user | Create one listing from the submitted information. | Tickets Service | No Ticket -> `available` | Validate the submission, assign immutable ownership from the authenticated identity, and return the created Ticket. Self-purchase remains allowed. | Invalid or unauthenticated submission creates no Ticket; an interrupted retry must return one logical listing rather than duplicate it. |
| 3 | Frontend Client | Present the committed listing. | Frontend Client | None | Show the created Ticket as available in its detail and owned-listing views. | A later discovery read may temporarily fail, but must not imply that creation failed if the committed result is already known. |

## 3. Edit an owned listing price

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Signed-in user | Submit a new valid price for an owned Ticket. | Tickets Service | `available` -> `available` with a new price | Accept only when the acting user owns the Ticket and it is still available; return the authoritative current Ticket. | Missing/non-owned, invalid, reserved, or sold Tickets remain unchanged. |
| 2 | Competing buyer | Begin purchase while the owner is editing. | Tickets Service | Exactly one of: price update while still `available`, or `available` -> `reserved` | Decide the edit-versus-reservation race atomically: an edit that wins supplies the price accepted by the later reservation; a reservation that wins rejects the edit. | Both cannot succeed against the old price/state. An existing Order amount never follows a later edit. |

## 4. Start purchase and resolve the reservation race

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Signed-in buyer | Begin purchasing a specific Ticket, including the buyer's own listing. | Orders Service | None | Establish one stable logical Order identity and one backend deadline 15 minutes from the purchase start for this logical attempt. | Repeated or uncertain client submissions must refer to the same logical attempt rather than create multiple active intents. Whether preparatory data is already durable is deferred to data design. |
| 2 | Orders Service | Ask for the Ticket to be reserved for that Order identity until the deadline. | Tickets Service | `available` -> `reserved`, recording matching `lockedByOrderId` and deadline; otherwise None | Recheck current availability and, for the one winner, return the accepted Ticket price and matching reservation result. Reject reserved, sold, or missing Tickets. | Concurrent buyers cannot both win. A stale read, buyer identity, or seller ownership cannot override availability. |
| 3 | Orders Service | Record the successful purchase intent from the winning reservation. | Orders Service | No Order -> `pending` | Capture buyer, Ticket identity, accepted price, currency, the same 15-minute backend deadline, and pending status. | A payable Order must never be exposed without its matching Ticket reservation. Later Ticket edits cannot change the captured amount. |
| 4 | Orders Service | Resolve a losing or interrupted start attempt. | Orders Service | None, or recovery toward one valid combined outcome | Return either the one pending Order with its matching reservation, or a rejection with no payable Order and no permanent orphan reservation. | If reservation succeeded but pending-Order recording did not, recovery must finish the matching Order or cause guarded release. The later consistency design must choose how. |
| 5 | Frontend Client | Present the successful pending Order. | Frontend Client | None | Open checkout with captured amount and remaining time calculated from the backend deadline. | The browser countdown is display-only and cannot extend, expire, reserve, or authorize payment. |

## 5. Pending-Order response retry or unknown response

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Frontend Client | Report that the purchase-start result was not received or is unknown. | Frontend Client | None | Show a recoverable pending state rather than claiming success or starting a different purchase automatically. | The original request may already have committed. |
| 2 | Signed-in buyer | Retry the same logical purchase attempt. | Orders Service | None when the valid combined outcome already exists | Return the same logical pending Order, captured amount, and unchanged deadline when its matching reservation exists. | A retry must not create a second active Order or extend the deadline. |
| 3 | Orders Service | Reconcile an incomplete combined outcome. | Orders Service | Missing pending Order may become `pending`, or an unusable intent remains non-payable | Converge to a pending Order with its matching reservation, or no payable Order followed by guarded release of any orphan reservation. | Exact persistence ordering, retry scheduling, and compensation are deferred; an unknown result cannot become two winners. |
| 4 | Orders Service | Request release when recovery cannot produce a valid pending Order. | Tickets Service | `reserved` -> `available` only when `lockedByOrderId` matches; otherwise None | Confirm the matching reservation is released or report that no matching release occurred. | A delayed recovery action must not release a newer reservation or a sold Ticket. |

## 6. Submit payment and confirm success

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Signed-in buyer | Submit payment for the displayed Order. | Orders Service | `pending` -> `payment_processing`, or None on rejection | Verify authenticated ownership, pending status, deadline not passed, and matching Ticket reservation. On success, freeze further submissions and expose processing. | Payment submission races expiration. Exactly one transition from pending wins; browser time does not decide it. Complete, expired, non-owned, or mismatched Orders are rejected. |
| 2 | Orders Payments capability | Begin one provider attempt for the eligible Order using the captured amount. | Orders Service | No Payment Attempt -> `processing` | Use only the Order amount and safe provider-facing payment material; never persist or log raw card number, expiry, or security code. | Repeated submission while unresolved must reuse the same logical attempt, not create another charge. |
| 3 | Payment provider | Evaluate the submitted provider attempt. | Payment provider | None in application-owned state | Produce a confirmed acceptance, confirmed decline, or unresolved result. | Loss or delay of the provider result must remain distinct from decline. |
| 4 | Orders Payments capability | Record a verified successful provider result. | Orders Service | Payment Attempt `processing` -> `succeeded`; Order `payment_processing` -> `complete` | Confirm the captured amount once and expose the completed Order. | Duplicate or delayed success cannot create another successful charge or complete an expired Order. An on-time attempt may complete after the displayed countdown reaches zero. |
| 5 | Orders Service | Converge the matching reserved Ticket to sold. | Tickets Service | `reserved` -> `sold` only when `lockedByOrderId` matches the completed Order; otherwise None | Confirm sold, or return a guarded non-change that remains recoverable when the matching sale has not converged yet. | A delayed or duplicate sale cannot sell a Ticket held by another Order. Failure after Order completion must be retried; expiration must never release a completed Order's reservation. |
| 6 | Frontend Client | Present the completed purchase. | Frontend Client | None | Stop the countdown, remove payment actions, and show confirmation using the Order's captured amount. | Temporary Ticket-sale convergence delay must not make the completed Order payable again. |

## 7. Confirmed decline while reservation time remains

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Payment provider | Return a confirmed decline or failure. | Payment provider | None in application-owned state | Provide a definitive failed result rather than an unresolved result. | A late or duplicate provider result must not reverse a terminal attempt. |
| 2 | Orders Payments capability | Record the confirmed failed attempt. | Orders Service | Payment Attempt `processing` -> `failed` | Preserve only safe failure information and keep the failed attempt terminal. | Failure recording must not charge, complete, or release the Ticket by itself. |
| 3 | Orders Service | Decide recovery while backend time remains. | Orders Service | Order `payment_processing` -> `pending` | If the authoritative deadline has not passed and the matching reservation remains valid, expose the failure and allow a later new payment attempt. | A stale browser countdown cannot authorize retry; eligibility is rechecked. The Ticket remains reserved. |
| 4 | Frontend Client | Present retryable failure. | Frontend Client | None | Show the confirmed failure, remaining display time, and a retry action. | Do not retry automatically or reuse raw payment data. |

## 8. Confirmed decline after the deadline

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Orders Payments capability | Record the confirmed failed attempt. | Orders Service | Payment Attempt `processing` -> `failed` | Preserve the definitive failure result. | This path applies only after an on-time submission finished unsuccessfully after the deadline. |
| 2 | Orders Service | Decide whether the failed Order can return to pending. | Orders Service | Order `payment_processing` -> `expired` | Because the deadline has passed, make the Order terminal and non-payable; require a new purchase attempt. | It must not return to pending or complete after expiration. |
| 3 | Orders Service | Request release of the expired Order's reservation. | Tickets Service | `reserved` -> `available` only when `lockedByOrderId` matches; otherwise None | Release the matching reservation or report a guarded non-change. | Temporary failure remains recoverable; stale release cannot unlock another Order's reservation. |
| 4 | Frontend Client | Present expiration after failure. | Frontend Client | None | Remove payment actions and show that the purchase must restart if the Ticket is available. | Browser display does not perform the release. |

## 9. Uncertain payment result

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Payment provider | Leave the result unresolved because acceptance or decline is not yet known. | Payment provider | None in application-owned state | The result remains explicitly unresolved. | Uncertainty must not be converted into success or failure for convenience. |
| 2 | Orders Payments capability | Preserve the unresolved attempt. | Orders Service | Payment Attempt remains `processing`; Order remains `payment_processing` | Show processing and continue backend resolution even if the browser closes. | Do not permit a duplicate payment, expire the Order, or release the Ticket while the on-time attempt is unresolved. |
| 3 | Orders Payments capability | Reconcile the provider result later. | Orders Service | Follow exactly one confirmed-success or confirmed-failure path once verified | Converge to complete plus guarded sold, pending plus retry when time remains, or expired plus guarded release after the deadline. | Provider acceptance with uncertain local recording must remain recoverable without another charge. The exact reconciliation mechanism is deferred. |

## 10. Pending-Order expiration

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Orders expiration capability | Reconsider a pending Order at or after its durable deadline. | Orders Service | `pending` -> `expired`, or None when ineligible | Expire only when the backend deadline has passed and no payment is processing. Repeated consideration returns the existing terminal result. | Payment submission and expiration race from pending; only one may win. Restart or closed browser must not extend or suppress expiration. |
| 2 | Orders Service | Request release for the expired Order. | Tickets Service | `reserved` -> `available` only when `lockedByOrderId` matches; otherwise None | Release the matching reservation; retries are harmless and continue until the valid matching reservation is no longer held. | A temporary failure cannot create an infinite lock. A stale release cannot unlock a newer reservation; sold remains sold. |
| 3 | Frontend Client | Observe the expired result. | Frontend Client | None | Countdown displays zero, payment disappears, and the user is told to restart purchase if the Ticket is available. | Reloading cannot restore or extend an expired Order. |

## 11. Processing Order when the deadline passes

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Orders expiration capability | Reconsider an Order whose deadline passed while payment is unresolved. | Orders Service | None; Order remains `payment_processing` | Keep the Order processing and the Ticket reserved until the on-time attempt reaches a confirmed result. | Deadline passage alone cannot expire a processing Order or release its Ticket. |
| 2 | Frontend Client | Display a zero countdown while payment remains unresolved. | Frontend Client | None | Replace Pay with processing status; do not claim expiration or allow another submission. | Browser countdown is not the Order state. |
| 3 | Orders Payments capability | Resolve the on-time attempt after the deadline. | Orders Service | Confirmed success -> `complete`; confirmed failure -> `expired` | Continue through guarded sold convergence after success or guarded release after failure. | Complete and expired are mutually exclusive; an unresolved attempt stays processing. |

## 12. Guarded release convergence

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Orders Service | Release a reservation for an expired or unrecoverable Order. | Tickets Service | Matching `reserved` -> `available`; otherwise None | Decide using the current Ticket state and exact `lockedByOrderId`. Duplicate release of an already available Ticket is harmless. | Reserved by another Order, sold, or already available must not be changed by a stale request. |
| 2 | Orders Service | Reconsider an unconfirmed matching release. | Orders Service | None in Order state | Keep release work recoverable until Tickets confirms the matching reservation is released or no longer belongs to that Order. | Recovery must survive process restart; scheduling and durability are deferred to data design. |

## 13. Guarded sold convergence

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Orders Service | Mark the completed Order's matching Ticket sold. | Tickets Service | Matching `reserved` -> `sold`; otherwise None | Decide using current Ticket state and exact `lockedByOrderId`. Duplicate confirmation of an already sold matching outcome is harmless. | Another Order's reservation must not be sold. |
| 2 | Orders Service | Reconsider an unconfirmed matching sale. | Orders Service | None; Order remains `complete` | Keep sale convergence recoverable until Tickets confirms sold for the completed Order. | Expiration cannot release a completed Order's reservation during recovery. Scheduling and durability are deferred to data design. |

## 14. My Orders and Order detail

| Step | Actor | Requested decision or action | Decision owner | State change | Required response or observable result | Important failure or race point |
|---|---|---|---|---|---|---|
| 1 | Signed-in user | Open My Orders. | Orders Service | None | Return only that user's pending, payment-processing, and completed Orders for the initial view; omit expired Orders. Include captured amount, status, applicable backend deadline, and enough Ticket identity to remain understandable. | Temporary failure is not an empty history. Repeated purchase/payment attempts must not produce duplicate logical entries. |
| 2 | Signed-in user | Open or refresh one Order. | Orders Service | None | Return it only to its authenticated owner with current status, captured amount, deadline, and recognizable Ticket information. | Guessing an identifier cannot reveal another user's Order. A stale detail cannot authorize payment. |
| 3 | Frontend Client | Present actions for the current Order state. | Frontend Client | None | Pending may show countdown and Pay only while backend eligibility can still be checked; processing shows no duplicate Pay; complete is view-only; expired is non-payable if directly observed. | The displayed countdown and status are advisory; every payment submission is rechecked by Orders. |
| 4 | Signed-in user | Review an existing Order after Ticket data changes or disappears. | Orders Service | None | Preserve the captured amount, status, and enough recognizable Ticket information for the Order to remain understandable. | The later data design must decide which Ticket details are captured by Orders rather than read live. |

## Unresolved decisions intentionally deferred

These flows define required chronology and outcomes but do not decide:

1. Which interactions require an immediate answer and which committed facts may be observed later.
2. The externally visible operations, authorization propagation, request shapes, responses, business errors, and idempotency representation.
3. The concrete committed-fact contracts, ordering, duplicate, late, and versioning rules.
4. The persistence order around reservation and pending-Order recording, and the durable mechanism that finishes or compensates an interrupted start.
5. The durable scheduling and retry mechanism for expiration, release convergence, sold convergence, and provider-result reconciliation.
6. How provider acceptance is recovered when provider state and local state temporarily disagree.
7. Which recognizable Ticket fields Orders captures so completed history survives later listing changes or removal.

Those decisions belong, in order, in communication, committed-fact contracts, operation contracts, and data/consistency design before sequence diagrams and implementation planning.
