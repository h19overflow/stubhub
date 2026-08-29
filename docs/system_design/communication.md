# Commerce Communication — Step 5

**Status:** Proposed design for review. This is not yet an accepted contract.

## Purpose

This document classifies the interactions in `interaction_flows.md` by the behavior they require. It decides when a caller needs an immediate authoritative answer, when Orders must retain durable internal work, and when another service may react asynchronously to a committed fact.

It does not define operation schemas, committed-fact names or contents, persistence structures, broker topology, or message sequences.
The browser countdown remains display-only; Orders' backend deadline and current state remain authoritative.

## Communication classes

### Immediate request/decision

The caller cannot safely continue without the current decision owner's answer. Reads, authorization-sensitive actions, reservation winning, accepted price, payment eligibility, and matching-reservation verification belong here. Immediate cross-service decisions use direct service calls; Redis is never used to answer them.

An immediate answer may be success, business rejection, temporary failure, or unknown outcome. Unknown is not equivalent to rejection and does not authorize a new logical attempt.

### Internal durable work

One service has already accepted responsibility for work that must survive browser closure, process restart, temporary dependency failure, or an unresolved provider result. The owning service retains and retries that work without making the browser authoritative.

Orders owns durable work for purchase recovery, provider-result reconciliation, expiration reconsideration, and convergence after an Order completes or expires. This does not create separate Payments or Expiration services; both remain capabilities inside Orders.

### Asynchronous committed fact

An authoritative state change has already committed, so the initiating user decision does not wait for every downstream reaction. Orders completion and Orders expiration are facts that Tickets observes asynchronously to perform its separately owned guarded state transition.

Delivery may be duplicated, delayed, or arrive after a newer Ticket state. Tickets must therefore decide from its current state and the matching `lockedByOrderId`, not trust delivery timing. Exact committed-fact contracts are deferred to `events.md`.

## Decision matrix

| Interaction | Initiator -> decision owner | Classification | Required answer or outcome | Why behavior requires this choice | Failure semantics |
|---|---|---|---|---|---|
| Establish current identity | Frontend Client -> Identity Service | Immediate request/decision | Authenticated identity or rejection | Protected actions cannot proceed on a caller assertion. | Temporary failure is not signed-out; invalid or expired identity does not authorize work. |
| Check resource ownership | Frontend Client or Orders -> resource-owning service | Immediate request/decision | Authorized decision without accepting caller-supplied ownership | Tickets owns listing ownership; Orders owns Order ownership. | Rejection changes no state and must not expose another user's resource. |
| Discover available Tickets | Frontend Client -> Tickets Service | Immediate request/decision | Current available result or temporary failure | The user needs an authoritative read; a broker-delayed view cannot authorize purchase. | Empty and unavailable are distinct from temporary failure. |
| Read Ticket detail | Frontend Client -> Tickets Service | Immediate request/decision | Current Ticket or not-found result | Availability shown to the user must come from Tickets. | A stale result remains advisory; purchase rechecks availability. |
| Create a listing | Frontend Client -> Tickets Service | Immediate request/decision | One created Ticket or rejection | The user needs to know whether required data and authenticated ownership were accepted. | Unknown response may have committed; retry must recover one logical listing. |
| Edit Ticket price | Frontend Client -> Tickets Service | Immediate request/decision | Updated Ticket or ownership/state rejection | Tickets must decide owner, availability, and the edit/reservation race at the moment of change. | Reserved, sold, non-owned, invalid, or missing Tickets remain unchanged. |
| Start purchase | Frontend Client -> Orders Service | Immediate request/decision | Pending Order, business rejection, temporary failure, or unknown outcome | Checkout cannot begin without a valid pending Order and matching reservation. Orders allocates the stable logical Order identity and coordinates the attempt. | Unknown response does not authorize another logical attempt or a new deadline. |
| Decide reservation winner and accepted price | Orders Service -> Tickets Service | Immediate request/decision by direct service call | Matching reservation with authoritative accepted price, or rejection | Exactly one buyer must win and Orders must capture the price accepted by Tickets. | Timeout or unknown response requires recovery; Orders cannot assume either success or rejection. Redis is not used. |
| Record or recover pending purchase | Orders capability -> Orders Service | Internal durable work | Converge to pending Order plus matching reservation, or no payable Order plus guarded release | A partial purchase start must not leave an orphan reservation or payable unmatched Order. | Work survives browser closure and restart; retry never extends the original deadline. |
| Look up retry outcome | Frontend Client -> Orders Service | Immediate request/decision | Existing logical pending outcome, rejection, or still-unknown recovery state | The caller must recover the original attempt rather than create another one. | Missing client response is not evidence that no Order exists. |
| Guardedly release an unrecoverable start | Orders Service -> Tickets Service | Immediate request/decision by direct service call | Matching release or guarded non-change | Before an Order has a committed expiration fact, purchase recovery needs to know whether its specific orphan reservation was removed. | Only matching `lockedByOrderId` may release; unknown result remains retryable. Redis is not used for this recovery decision. |
| Read Order or My Orders | Frontend Client -> Orders Service | Immediate request/decision | Owner-scoped current Order data or temporary failure | Privacy, current status, captured amount, and payment presentation require Orders' answer. | Temporary failure is not empty history; stale display never authorizes payment. |
| Decide payment eligibility | Frontend Client -> Orders Service | Immediate request/decision | Enter processing or reject as non-payable | Ownership, Order state, backend deadline, and reservation match must be decided before provider submission. | Payment and expiration race inside Orders; exactly one may leave pending. |
| Verify matching reservation for payment | Orders Service -> Tickets Service | Immediate request/decision by direct service call | Reservation belongs to this Order, or it does not | A pending Order is payable only with its current matching Ticket reservation. | Unknown verification prevents provider submission; Redis is never used for eligibility. |
| Submit to local deterministic provider | Orders Payments capability -> local deterministic provider | Orders-internal provider request with immediate accepted/declined/unresolved response | One deterministic provider outcome classification | The learning implementation needs controllable success, decline, and unresolved behavior without changing business ownership. Orders still decides Order state. | Provider acceptance alone is not Order completion. Unresolved is neither success nor decline. No provider interface schema is chosen here. |
| Reconcile unresolved provider result | Orders Payments capability -> Orders Service | Internal durable work | Later verified accepted or declined result | Browser retry could duplicate a charge; Orders must continue resolution durably. | Order and attempt remain processing; expiration and duplicate submission are blocked until resolution. |
| Record confirmed decline with time remaining | Orders Payments capability -> Orders Service | Immediate decision when result is present; otherwise outcome of internal durable work | Failed attempt and Order returned to pending | No Ticket change is needed while reservation time remains. | A later retry is allowed only after fresh eligibility and reservation checks. |
| Record confirmed decline after deadline | Orders Payments capability -> Orders Service | Immediate decision when result is present; otherwise outcome of internal durable work | Failed attempt and expired Order | A failed on-time attempt may not return to pending after the deadline. | Expiration becomes a committed Orders fact only after the failed result is confirmed. |
| Record confirmed payment success | Orders Payments capability -> Orders Service | Immediate decision when result is present; otherwise outcome of internal durable work | Successful attempt and completed Order | Orders owns whether provider acceptance becomes completion and must enforce one completion. | Duplicate or late confirmation returns the existing terminal outcome and never charges again. |
| Observe completed Order | Orders Service -> Tickets Service | Asynchronous committed fact | Tickets attempts guarded `reserved` -> `sold` | The Order is already complete; the buyer response need not wait for temporary Ticket convergence. Tickets still owns sold state. | Duplicate or late delivery is expected. A nonmatching reservation is unchanged; matching convergence remains retryable. |
| Reconsider pending deadline | Orders expiration capability -> Orders Service | Internal durable work | Pending remains pending before deadline or becomes expired at/after it | Expiration must happen without a browser and survive restart. | Processing, complete, and already expired Orders are unchanged. Missed work remains discoverable. |
| Observe expired Order | Orders Service -> Tickets Service | Asynchronous committed fact | Tickets attempts guarded `reserved` -> `available` | The Order is already terminal; release may converge independently while Tickets preserves authority. | Duplicate or late delivery is expected. A different `lockedByOrderId`, sold, or already available Ticket is unchanged. |
| Track completion/expiration convergence | Orders capability -> Orders Service | Internal durable work | Keep unresolved sold/release convergence recoverable | Temporary downstream failure must not leave a permanent reserved Ticket. | Retry continues without changing the terminal Order; exact completion evidence is deferred. |
| Display countdown | Frontend Client -> local clock/display | Local presentation; no authoritative communication | Remaining display time derived from backend deadline | Frequent display updates do not require backend decisions. | Reaching zero does not expire an Order, release a Ticket, or resolve processing. Reads and actions recheck Orders. |

## Per-flow communication trace

### 1. Ticket discovery

1. The Frontend Client obtains identity when a protected action requires it: **immediate request/decision** with Identity.
2. Marketplace and Ticket-detail reads are **immediate request/decisions** with Tickets.
3. Filtering and display cause no durable work or committed fact.
4. A stale detail never bypasses the later reservation decision.

### 2. Create an owned listing

1. The Frontend Client submits listing intent to Tickets: **immediate request/decision**.
2. Tickets decides authenticated ownership, validation, and creation.
3. An unknown response is retried as the same logical creation; no cross-service communication is needed.

### 3. Edit an owned listing

1. The Frontend Client submits the new price to Tickets: **immediate request/decision**.
2. Tickets alone decides ownership, current state, and the edit/reservation race.
3. No asynchronous committed fact is required by the accepted commerce flow for a price edit.

### 4. Start purchase and reservation race

1. The Frontend Client asks Orders to start one logical purchase: **immediate request/decision**.
2. Orders allocates the stable logical Order identity and coordinates the attempt.
3. Orders asks Tickets to choose the reservation winner and accepted price: **immediate request/decision by direct service call**.
4. Orders records or recovers the combined pending outcome as **internal durable work** when the immediate path is interrupted.
5. The buyer receives pending checkout only after Orders can expose a valid matching outcome.

### 5. Pending response retry or unknown response

1. The Frontend Client asks Orders for the original logical result: **immediate request/decision**.
2. Orders returns the same pending result or exposes that recovery is still unresolved.
3. Incomplete combined state remains **internal durable work** owned by Orders.
4. If recovery chooses no payable Order, Orders obtains a guarded release decision directly from Tickets; it does not infer release from delay.

### 6. Payment submission and confirmed success

1. The Frontend Client asks Orders to pay: **immediate request/decision**.
2. Orders directly verifies the matching reservation with Tickets before provider submission: **immediate request/decision**.
3. Orders submits to the local deterministic provider and receives accepted, declined, or unresolved: **Orders-internal provider request**.
4. Verified acceptance lets Orders decide completion.
5. Completion is then an **asynchronous committed fact** observed by Tickets for guarded sold convergence.
6. Any unresolved convergence remains **internal durable work**; the completed buyer outcome is not made payable again.

### 7. Confirmed decline with time remaining

1. The provider returns a confirmed decline to Orders.
2. Orders records failure and, after checking its backend deadline, returns the Order to pending.
3. Tickets receives no committed fact because the matching reservation remains unchanged.
4. A later retry repeats immediate eligibility and matching-reservation decisions before another provider submission.

### 8. Confirmed decline after deadline

1. The provider returns a confirmed decline to Orders.
2. Orders records failure and decides the processing Order is expired.
3. Expiration becomes an **asynchronous committed fact** observed by Tickets for guarded release.
4. Unconfirmed release convergence remains **internal durable work** in Orders.

### 9. Uncertain payment result

1. The local deterministic provider returns unresolved to Orders immediately.
2. Orders exposes processing and retains provider reconciliation as **internal durable work**.
3. No expiration or Ticket convergence occurs while the attempt remains unresolved.
4. A later verified result follows the success or confirmed-decline trace; the browser does not resubmit blindly.

### 10. Pending-Order expiration

1. Orders retains deadline reconsideration as **internal durable work** independent of the browser.
2. Orders alone decides `pending` -> `expired` at or after the backend deadline.
3. Expiration becomes an **asynchronous committed fact** observed by Tickets for guarded release.
4. Duplicate or delayed observation cannot release a newer reservation.

### 11. Processing Order at the deadline

1. Orders' expiration capability rechecks the Order as **internal durable work**.
2. A processing Order does not expire, and no expiration fact exists.
3. Provider reconciliation remains **internal durable work** until accepted or declined is verified.
4. The browser may display zero but makes no authoritative communication or state change.

### 12. Guarded release convergence

1. Tickets observes committed expiration asynchronously and decides from current Ticket state plus `lockedByOrderId`.
2. Matching reservation becomes available; nonmatching, sold, or already available state is unchanged.
3. Delivery and application may repeat. Orders keeps unresolved convergence as **internal durable work**.

### 13. Guarded sold convergence

1. Tickets observes committed completion asynchronously and decides from current Ticket state plus `lockedByOrderId`.
2. Matching reservation becomes sold; another Order's reservation is unchanged.
3. Delivery and application may repeat. Orders keeps unresolved convergence as **internal durable work** and expiration never releases a completed Order's reservation.

### 14. My Orders and detail

1. My Orders and Order detail are **immediate request/decisions** with Orders.
2. Orders applies authenticated ownership and returns current status, captured amount, backend deadline, and recognizable Ticket information.
3. Reading causes no durable work or committed fact.
4. Countdown and actions remain presentation; payment eligibility is checked again when requested.

## Failure semantics

### Business rejection

The decision owner returns a definitive non-change: unavailable Ticket, unauthorized resource, invalid listing, non-payable Order, expired deadline, or mismatched reservation. The caller may present that result but must not compensate for a rejection that made no change.

### Temporary failure

The caller does not know whether the owner rejected the work or could not evaluate it. Reads show temporary failure rather than false empty state. State-changing callers retry the same logical attempt or recover its outcome; they do not create a replacement automatically.

### Unknown outcome

The owner may have committed even though the caller lacks the result. Purchase start and provider submission must preserve this distinction. Orders performs retry lookup or durable reconciliation, returning the original logical outcome when found.

### Duplicate or late asynchronous observation

Tickets expects both. It applies only guarded transitions allowed by current state and matching `lockedByOrderId`. Delivery timing never overrides Tickets authority, and an older expiration cannot release a newer reservation.

### Dependency unavailable during convergence

A completed or expired Order remains terminal. Orders retains durable convergence work until the matching Ticket reaches sold or available, or Tickets authoritatively shows that a guarded non-change is correct. Temporary failure never reopens the Order.

## Explicit non-choices

- No Redis-mediated authoritative decision. Reservation, accepted price, payment eligibility, matching-reservation verification, and reads require immediate owner answers.
- No committed-fact names, contents, versions, ordering keys, or delivery topology; those wait for `events.md`.
- No operation paths, methods, response codes, or request/response schemas.
- No persistence tables, atomicity mechanism, or commit ordering.
- No stream names, groups, retention, acknowledgement, or retry configuration.
- No sequence diagrams.
- No separate Payments or Expiration service.
- No browser-driven expiration, reservation extension, payment eligibility, sold transition, or release.
- No assumption that provider acceptance alone completes an Order.
- No requirement that the buyer wait for Tickets convergence after Orders is already complete or expired.
- No choice yet for how Orders proves downstream sold/release convergence; data and committed-fact design must settle it.
