# Commerce API Contracts — Step 7

**Status:** Proposed design for review. This is not yet an accepted contract.

## Scope and cutover

These contracts replace the current unsafe Orders creation surface. There is no compatibility route, legacy body shape, alias, or caller-supplied business authority.

Public client operations and internal service operations are separate trust boundaries. Public Orders operations never accept caller-supplied `userId`, amount, currency, Order identity, Order state, or deadline. The internal Tickets reservation command accepts an Orders-allocated `orderId` and backend deadline only from authenticated Orders service communication; Tickets still makes the authoritative availability and accepted-price decision.

Terminal Order completion and expiration continue to converge through the two committed facts defined in `events.md`. There is no internal sold command or terminal-release command.

## Common conventions

### Media and strictness

- Successful structured responses are JSON.
- JSON request bodies are strict: unknown fields are rejected.
- Multipart listing creation accepts only the documented fields and exactly one documented image field; unknown fields are rejected.
- JSON field names and response shapes below are the contract.

### Error envelope

Every error response is JSON:

```json
{
  "error": "Human-readable message",
  "code": "machine_readable_code"
}
```

`error` is safe for presentation. `code` is stable for program behavior. Unexpected failures use `internal_error` without leaking implementation details.

### Public authentication

Protected public operations independently verify an Identity-issued access JWT and derive `userId` from its subject. Missing, malformed, invalid, or expired credentials return:

- `401 { "error": "Authentication required", "code": "authentication_required" }`

Public services never trust a user identifier in a path, query, body, or custom identity header. Other-owner Order reads and actions return `404 order_not_found`, not `403`, so identifier guessing does not reveal ownership.

### Idempotency-Key

Ticket creation, Order creation, and payment submission require `Idempotency-Key` with 1–128 printable visible ASCII characters.

- Missing or malformed key: `400 invalid_idempotency_key`.
- Scope: authenticated user for Ticket and Order creation; Order plus authenticated owner for payment.
- Same scoped key and same normalized request fingerprint: replay the original logical result without repeating work.
- Same scoped key and different fingerprint: `409 idempotency_conflict`.
- A replay preserves the original identity, business data, status outcome, and backend deadline. It never extends a reservation.

Fingerprints are server-derived from normalized accepted input. They never include caller-supplied authority. Payment fingerprints represent the submitted provider token without storing raw payment credentials.

### Common temporary failure

A temporary inability to obtain a required dependency decision returns:

- `503 { "error": "Required service is temporarily unavailable", "code": "dependency_unavailable" }`

The caller may retry the same logical request. A `503` is not a business rejection and does not prove that an earlier unknown state-changing attempt made no change. Operation-specific unknown-result rules below take precedence when durable recovery has already assumed responsibility.

## Shared DTOs

### Public Ticket

```json
{
  "id": "ticket-id",
  "eventName": "Event name",
  "description": "Listing description",
  "eventStartsAt": "2026-09-10T19:00:00.000Z",
  "eventEndsAt": null,
  "ticketInfo": "General admission",
  "place": "Venue, City",
  "priceCents": 12500,
  "currency": "USD",
  "imageUrl": "/ticket-images/opaque-image-name",
  "status": "available",
  "createdAt": "2026-08-27T12:00:00.000Z",
  "updatedAt": "2026-08-27T12:00:00.000Z"
}
```

`status` is `available`, `reserved`, or `sold`. Public and owned Ticket responses use this same DTO. Ownership is implicit in the protected My Tickets result. The DTO never exposes `ownerId`, `lockedByOrderId`, `lockExpiresAt`, credentials, private identity data, idempotency metadata, or storage filenames.

### Ticket page

```json
{
  "tickets": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

### Immutable Order Ticket snapshot

```json
{
  "eventName": "Event name",
  "eventStartsAt": "2026-09-10T19:00:00.000Z",
  "eventEndsAt": null,
  "place": "Venue, City",
  "ticketInfo": "General admission"
}
```

`eventEndsAt` is an optional timestamp represented as a timestamp or `null`. Orders captures this snapshot from the successful Tickets reservation response. It is the minimum durable identity needed to keep pending and completed history recognizable if mutable listing data later changes or disappears. Image is deliberately not part of the durable Order snapshot.

### Public Order

```json
{
  "id": "order-id",
  "ticketId": "ticket-id",
  "amountCents": 12500,
  "currency": "USD",
  "status": "pending",
  "expiresAt": "2026-08-27T12:15:00.000Z",
  "version": 1,
  "ticket": {
    "eventName": "Event name",
    "eventStartsAt": "2026-09-10T19:00:00.000Z",
    "eventEndsAt": null,
    "place": "Venue, City",
    "ticketInfo": "General admission"
  },
  "createdAt": "2026-08-27T12:00:00.000Z",
  "updatedAt": "2026-08-27T12:00:00.000Z"
}
```

`status` is `pending`, `payment_processing`, `complete`, or `expired`. The DTO omits `userId`, idempotency metadata, provider data, and internal recovery state. The amount, currency, deadline, and snapshot are server-owned.

### Public Payment Attempt

```json
{
  "id": "payment-attempt-id",
  "orderId": "order-id",
  "status": "processing",
  "providerReference": null,
  "failureCode": null,
  "createdAt": "2026-08-27T12:05:00.000Z",
  "updatedAt": "2026-08-27T12:05:00.000Z"
}
```

`status` is `processing`, `succeeded`, or `failed`. Only a safe provider reference or non-sensitive failure code may be returned. Raw card number, expiry, security code, and provider secrets never enter these contracts.

## Tickets public operations

### `GET /tickets`

**Authorization:** None.

**Request:** No body. Optional query fields:

- `q`: non-empty trimmed string, maximum 100 characters; case-insensitive partial match across event name, description, ticket information, and place.
- `place`: non-empty trimmed string, maximum 200 characters; case-insensitive partial match.
- `startsAfter`: inclusive ISO-8601 event-start lower bound.
- `startsBefore`: inclusive ISO-8601 event-start upper bound.
- `minPriceCents`: inclusive positive safe integer.
- `maxPriceCents`: inclusive positive safe integer.
- `page`: positive integer, default `1`.
- `pageSize`: positive integer, default `20`, maximum `100`.

Contradictory date or price ranges are invalid. Only currently available Tickets are returned, ordered by event start and then Ticket identity.

**Success:**

- `200` with a Ticket page.

**Errors:**

- `400 invalid_filters`: malformed, unknown, or contradictory query fields.
- `500 internal_error`.

**Idempotency and unknown result:** Read-only. Repetition has no state effect. Temporary failure is not an empty page.

### `GET /tickets/:ticketId`

**Authorization:** None.

**Request:** Ticket identity in the path; no body.

**Success:**

- `200 { "ticket": PublicTicket }` for any current Ticket state.

**Errors:**

- `404 ticket_not_found`: missing or malformed Ticket identity.
- `500 internal_error`.

**Idempotency and unknown result:** Read-only. Repetition returns current state and does not reserve the Ticket.

### `POST /tickets`

**Authorization:** Protected public operation. Owner derives from JWT subject.

**Request:** `multipart/form-data`, required valid `Idempotency-Key`, exactly one image field named `image`, and text fields:

- `eventName`: trimmed, 1–120 characters.
- `description`: trimmed, 1–2000 characters.
- `eventStartsAt`: ISO-8601 timestamp.
- `eventEndsAt`: optional ISO-8601 timestamp later than start.
- `ticketInfo`: trimmed, 1–1000 characters.
- `place`: trimmed, 1–200 characters.
- `priceCents`: decimal representation of a positive safe integer.

Image is JPEG, PNG, or WebP by validated bytes and at most 5 MiB. Unknown fields, missing fields, additional files, and caller ownership are rejected. Fingerprint covers normalized fields and uploaded image bytes.

**Success:**

- `201 { "outcome": "created", "ticket": PublicTicket }` for first creation.
- `200 { "outcome": "replayed", "ticket": PublicTicket }` for same key and fingerprint.

**Errors:**

- `400 invalid_ticket`: invalid or unknown listing fields, missing image, or invalid time ordering.
- `400 invalid_idempotency_key`.
- `401 authentication_required`.
- `409 idempotency_conflict`.
- `413 image_too_large`.
- `415 unsupported_image`.
- `500 internal_error`.

**Idempotency and unknown result:** Same logical retry returns the original Ticket. An interrupted response never justifies a new key unless the user intentionally creates a separate listing.

### `GET /tickets/mine`

**Authorization:** Protected public operation. Owner derives from JWT subject.

**Request:** No body. Optional `page` and `pageSize` follow marketplace pagination limits.

**Success:**

- `200` with a Ticket page containing only the authenticated owner's Tickets in all states, ordered newest first and then Ticket identity. Ownership is implicit; the Ticket DTO does not reveal owner or lock metadata.

**Errors:**

- `400 invalid_pagination`.
- `401 authentication_required`.
- `500 internal_error`.

**Idempotency and unknown result:** Read-only. Temporary failure is not an empty owned list.

### `PATCH /tickets/:ticketId/price`

**Authorization:** Protected public operation. Tickets derives acting user from JWT and checks ownership.

**Request:** Strict JSON:

```json
{
  "priceCents": 12500
}
```

`priceCents` is a positive safe integer.

**Success:**

- `200 { "ticket": PublicTicket }` when the owned Ticket is still available. Repeating the same price is successful and state-preserving.

**Errors:**

- `400 invalid_price`: missing, invalid, or unknown body field.
- `401 authentication_required`.
- `404 ticket_not_found`: missing Ticket, malformed identity, or Ticket owned by another user.
- `409 ticket_unavailable`: owned Ticket is reserved or sold.
- `500 internal_error`.

**Idempotency and unknown result:** No key is required. Re-read the Ticket after an unknown response; an exact repeat is safe. Tickets decides the edit/reservation race, so the caller never assumes the write won.

## Tickets internal authentication

Every `/internal/*` operation requires:

```text
Authorization: Bearer <INTERNAL_SERVICE_TOKEN>
```

Tickets exact-checks the credential against its separately configured `INTERNAL_SERVICE_TOKEN`. Orders receives the same secret through backend runtime configuration. It is distinct from Identity JWT signing material and is never exposed to the browser or forwarded from a browser request. Orders never forwards the buyer JWT to Tickets internal operations.

Missing, malformed, or incorrect internal credentials return:

- `401 { "error": "Internal authentication required", "code": "internal_authentication_required" }`

No caller-supplied service identity header is trusted.

## Tickets internal operations

### `PUT /internal/tickets/:ticketId/reservation`

**Authorization:** Internal service token; intended caller is Orders.

**Request:** Strict JSON:

```json
{
  "orderId": "order-id",
  "expiresAt": "2026-08-27T12:15:00.000Z"
}
```

`orderId` is the stable Orders-allocated identity. `expiresAt` is a valid future backend timestamp established by Orders for the original logical purchase. No buyer, amount, currency, price, or Ticket snapshot is accepted.

**Reservation response:**

```json
{
  "reservation": {
    "ticketId": "ticket-id",
    "orderId": "order-id",
    "expiresAt": "2026-08-27T12:15:00.000Z",
    "priceCents": 12500,
    "currency": "USD",
    "ticket": {
      "eventName": "Event name",
      "eventStartsAt": "2026-09-10T19:00:00.000Z",
      "eventEndsAt": null,
      "place": "Venue, City",
      "ticketInfo": "General admission"
    }
  }
}
```

**Success:**

- `201 { "outcome": "reserved", "reservation": Reservation }` for a new matching reservation.
- `200 { "outcome": "replayed", "reservation": Reservation }` when the same `orderId` and exact `expiresAt` already hold the reservation.

The returned price, currency, and immutable snapshot are the authoritative values Orders captures.

**Errors:**

- `400 invalid_reservation`: invalid identity, deadline, or unknown body field.
- `401 internal_authentication_required`.
- `404 ticket_not_found`.
- `409 reservation_conflict`: the same Order already identifies this reservation with a different deadline.
- `409 ticket_unavailable`: Ticket is reserved for another Order or sold.
- `500 internal_error`.

**Idempotency and unknown result:** The exact `(ticketId, orderId, expiresAt)` command is intrinsically replayable and requires no separate idempotency key. After an unknown response, Orders repeats the exact command. It never changes the deadline. A temporary failure remains unknown, not unavailable.

### `GET /internal/tickets/:ticketId/reservation/:orderId`

**Authorization:** Internal service token; intended caller is Orders.

**Request:** Ticket and Order identities in the path; no body.

**Success:**

- `200 { "reservation": Reservation }` only when the Ticket is currently reserved and `lockedByOrderId` exactly matches `orderId`.

The response includes current reservation deadline, accepted `priceCents`, `currency`, and the immutable snapshot shape. Orders uses this decision for purchase recovery and payment eligibility; it does not replace its captured Order values after creation.

**Errors:**

- `400 invalid_reservation_identity`: malformed identity.
- `401 internal_authentication_required`.
- `404 reservation_not_found`: Ticket missing, not reserved, or reserved for another Order.
- `500 internal_error`.

**Idempotency and unknown result:** Read-only. Repetition has no state effect. Unknown or temporary failure prevents provider submission; it is not interpreted as a match.

### `POST /internal/tickets/:ticketId/reservation/:orderId/release`

**Authorization:** Internal service token; intended caller is Orders purchase recovery only.

**Request:** Ticket and Order identities in the path; no body.

**Success:** Always `200` for an authenticated, well-formed guarded decision:

```json
{
  "outcome": "released"
}
```

`outcome` is exactly one of:

- `released`: matching reservation changed to available.
- `already_available`: Ticket already available.
- `not_matching`: Ticket is reserved for a different Order.
- `sold`: Ticket is sold.
- `missing`: Ticket does not exist.

Every outcome is an authoritative safe non-retry result. Only transport failure or an unknown response is retried with the exact same command.

**Errors:**

- `400 invalid_reservation_identity`.
- `401 internal_authentication_required`.
- `500 internal_error`.

**Idempotency and unknown result:** Guarded repetition is safe and requires no separate idempotency key. After an unknown response, repeat the same command. This operation is only for purchase-start recovery before a valid payable Order is exposed. Terminal Order completion and expiration use the committed facts from `events.md`, not this operation.

## Orders protected operations

### `POST /orders`

**Authorization:** Protected public operation. Buyer derives from JWT subject.

**Request:** Required valid `Idempotency-Key` and strict JSON:

```json
{
  "ticketId": "ticket-id"
}
```

Orders allocates the Order identity and fixed 15-minute backend deadline. It asks Tickets for the reservation winner, accepted price, and immutable snapshot. It never accepts buyer, amount, currency, Order identity, state, deadline, or Ticket snapshot from the caller.

**Success:**

- `201 { "outcome": "created", "order": PublicOrder }` after both matching reservation and pending Order exist.
- `200 { "outcome": "replayed", "order": PublicOrder }` for the same key and fingerprint after the valid combined outcome exists.
- `202 { "outcome": "processing" }` with `Retry-After` when Orders has accepted durable responsibility for an unknown or incomplete purchase-start outcome.

A `202` contains no payable Order. The caller retries the same operation with the same key after `Retry-After`. Recovery returns the final created/replayed Order or a definitive business rejection without changing the original deadline.

**Errors:**

- `400 invalid_order`: malformed Ticket identity or unknown body field.
- `400 invalid_idempotency_key`.
- `401 authentication_required`.
- `404 ticket_not_found`: Tickets definitively reports the Ticket missing.
- `409 ticket_unavailable`: Tickets definitively reports reserved or sold.
- `409 idempotency_conflict`.
- `503 dependency_unavailable`: dependency could not be reached before Orders accepted durable recovery responsibility.
- `500 internal_error`.

**Idempotency and unknown result:** Key is scoped to authenticated buyer; fingerprint is normalized `ticketId`. Same key never allocates a second logical Order or extends the deadline. No payable Order is returned until Orders confirms its matching reservation. Durable partial-state recovery converges to the same pending Order or a guarded release and definitive non-payable result.

### `GET /orders/mine`

**Authorization:** Protected public operation. Buyer derives from JWT subject.

**Request:** No body.

**Success:**

- `200 { "orders": [PublicOrder] }` containing only the authenticated user's `pending`, `payment_processing`, and `complete` Orders, newest first. Expired Orders are omitted from the initial view.

**Errors:**

- `401 authentication_required`.
- `500 internal_error`.

**Idempotency and unknown result:** Read-only. Temporary failure is not an empty history. Captured values and snapshots do not follow later Ticket changes.

### `GET /orders/:orderId`

**Authorization:** Protected public operation. Orders derives buyer and enforces ownership.

**Request:** Order identity in path; no body.

**Success:**

- `200 { "order": PublicOrder }` for the authenticated owner, including expired Orders when directly addressed.

**Errors:**

- `401 authentication_required`.
- `404 order_not_found`: malformed, missing, or owned by another user.
- `500 internal_error`.

**Idempotency and unknown result:** Read-only. This is the polling surface only for an already-returned Order's payment and status, including completion or expiration. A purchase-start `202` is recovered only by repeating `POST /orders` with the same `Idempotency-Key`; it cannot be polled here before an Order is returned. Polling never changes state or extends the deadline.

### `POST /orders/:orderId/payments`

**Authorization:** Protected public operation. Orders derives buyer and enforces ownership.

**Request:** Required valid `Idempotency-Key` and strict JSON:

```json
{
  "paymentMethodToken": "local.success"
}
```

For the selected local deterministic learning provider, `paymentMethodToken` is exactly one of:

- `local.success`
- `local.decline`
- `local.processing-success`
- `local.processing-decline`

These are test behavior tokens, not raw payment credentials. No amount, currency, buyer, Ticket, Order state, or deadline is accepted.

Before provider submission, Orders verifies:

1. authenticated ownership;
2. Order is `pending`;
3. backend deadline has not passed;
4. Tickets confirms the current matching reservation for this Order.

Orders then uses only its captured amount and currency. The local deterministic provider returns accepted, declined, or unresolved as specified in `communication.md`.

**Success:**

Immediate or replayed success:

- `200 { "outcome": "succeeded", "order": PublicOrder, "paymentAttempt": PublicPaymentAttempt }` with completed Order and succeeded attempt.

Immediate or replayed confirmed decline:

- `200 { "outcome": "declined", "order": PublicOrder, "paymentAttempt": PublicPaymentAttempt }` with failed attempt and Order returned to pending when time remains or expired when the deadline has passed.

Unresolved processing:

- `202 { "outcome": "processing", "order": PublicOrder, "paymentAttempt": PublicPaymentAttempt }` with `Retry-After`.

A same-key replay returns the existing exact outcome without another provider submission. A different valid key received while any attempt is processing returns the existing `202 processing` response and does not call the provider again. The caller polls `GET /orders/:orderId`; it does not resubmit blindly.

A confirmed decline is an observed provider outcome, not an error response.

**Errors:**

- `400 invalid_payment`: missing, unsupported, malformed, or unknown body field.
- `400 invalid_idempotency_key`.
- `401 authentication_required`.
- `404 order_not_found`: malformed, missing, or owned by another user.
- `409 order_not_payable`: Order is complete, expired, or the deadline passed before submission.
- `409 reservation_mismatch`: Tickets definitively reports that the matching reservation does not exist.
- `409 idempotency_conflict`.
- `503 dependency_unavailable`: reservation verification or provider decision is temporarily unavailable before an attempt becomes durable processing work.
- `500 internal_error`.

**Idempotency and unknown result:** Key is scoped to Order and owner; fingerprint is the accepted `paymentMethodToken`. Provider submission occurs at most once per logical attempt. Once processing begins, unresolved provider state remains durable Orders work, blocks expiration and further provider submission, and resolves to exactly one confirmed outcome. Exact succeeded/declined replay remains `200`; unresolved remains `202`. Orders completion and expiration produce only the committed facts already defined in `events.md`.

## Client boundary

The browser uses same-origin service prefixes:

- `/api/identity/*` -> Identity
- `/api/tickets/*` -> Tickets
- `/api/orders/*` -> Orders
- `/ticket-images/*` -> Tickets public image route

Public Ticket discovery/detail calls send no access token. Protected calls use an Identity access token held only in application memory:

1. sign-in stores the returned access token in memory before navigation;
2. refresh obtains a new access token through the same-origin Identity refresh operation using the HttpOnly refresh cookie;
3. protected calls attach `Authorization: Bearer <access-token>`;
4. after one `401`, the client refreshes and retries the original request at most once;
5. a second `401` ends the protected attempt and returns the user to authentication;
6. access tokens are never written to `localStorage`, `sessionStorage`, URLs, or rendered markup.

A page reload may empty memory; the refresh cookie restores an access token through the same-origin Identity boundary. The browser never receives `INTERNAL_SERVICE_TOKEN` and never calls `/internal/*`. No same-origin rewrite exposes Tickets internal routes.

## Contract/error summary

| Code | Meaning |
|---|---|
| `authentication_required` | Public JWT missing or invalid. |
| `internal_authentication_required` | Internal service token missing or invalid. |
| `invalid_idempotency_key` | Required key missing or outside the printable 1–128 rule. |
| `idempotency_conflict` | Same scoped key reused for a different fingerprint. |
| `ticket_not_found` | Public/internal Ticket lookup definitively missing. |
| `ticket_unavailable` | Ticket reserved by another Order or sold. |
| `reservation_conflict` | Same Order attempts to replay reservation with a different deadline. |
| `reservation_not_found` | No current reservation matching Ticket and Order. |
| `order_not_found` | Order missing, malformed, or belongs to another user. |
| `order_not_payable` | Current Order state/deadline forbids a new payment attempt. |
| `reservation_mismatch` | Orders cannot confirm the reservation required for payment. |
| `dependency_unavailable` | Required authoritative dependency decision is temporarily unavailable. |
| `internal_error` | Unexpected failure without leaked internals. |

Operation-specific validation codes remain distinct as listed above. Clients branch on `code`, not human-readable text.

## Explicit exclusions

- No compatibility with the current caller-authored Orders body.
- No browser-supplied identity, amount, currency, Order identity, state, deadline, reservation, or snapshot.
- No public Ticket `ownerId`, `lockedByOrderId`, or `lockExpiresAt`.
- No browser access to internal Tickets operations or internal token.
- No terminal sold/release operation; completion and expiration convergence remain event-driven.
- No payment decline represented as an error response.
- No raw card data or production provider schema.
- No database schema or transaction design.
- No event payload redefinition beyond references to `events.md`.
- No sequence diagrams.
