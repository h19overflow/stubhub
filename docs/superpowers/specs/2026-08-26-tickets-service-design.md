# Tickets Service Design

**Status:** Approved in chat on 2026-08-26

## Purpose

Build the first durable Tickets service increment for the ticket-management and ticket-discovery journeys. The service owns listing data, immutable seller ownership, price, discovery, and Ticket availability state. It follows the small feature-module structure already used by Identity/Auth.

## Goals

- Create a complete listing with one required image.
- List and filter available marketplace Tickets.
- Return one Ticket's current details and availability.
- List every Ticket owned by the authenticated user.
- Let only the owner update an available Ticket's price.
- Make interrupted create retries idempotent.
- Persist Tickets and uploaded images across local service restarts.
- Preserve the accepted `available | reserved | sold` Ticket vocabulary without implementing purchasing.

## Non-goals

- Purchase, reservation, release, sold-transition, Orders, payment, or event-bus operations.
- Editing owner, image, description, event timing, ticket information, or place after creation.
- Image transformation, thumbnails, CDN, object storage, malware scanning, or orphan-file background cleanup.
- ORM, shared database, shared Auth code package, or service-to-service Identity calls.
- Automated tests; repository guidance requires manual verification unless tests are explicitly requested.

## Service boundary

Tickets is authoritative for Ticket records and their availability state. Identity remains authoritative for accounts and access-token issuance. Tickets verifies Identity-issued access JWTs locally with the shared `JWT_SECRET`, `HS256`, issuer `stubhub-identity`, and audience `stubhub-api`. It uses JWT `sub` as the immutable `ownerId`; it never accepts owner identity from request data.

All listing API routes require a valid access JWT. Uploaded listing images are intentionally available through an unauthenticated static route so a normal browser `<img>` element can render them without a custom Authorization header. Image filenames are random and expose neither the owner nor original filename. The public `/health` route remains unchanged.

## Module organization

The service mirrors Auth's explicit application/entrypoint split, centralized HTTP concerns, and feature folders:

```text
tickets/
  .env.example
  migrations/
    001_create_tickets.sql
  src/
    index.ts
    app.ts
    database.ts
    http/
      error-handler.ts
      require-auth.ts
      routes/
        create-ticket.ts
        get-ticket.ts
        list-my-tickets.ts
        list-tickets.ts
        update-ticket-price.ts
    images/
      image-upload.ts
    tickets/
      schemas.ts
      ticket-repo.ts
      ticket.ts
    tokens/
      access-token.ts
      token-config.ts
```

No interface, service class, factory, or shared package is needed. Routes validate transport input and call small repository functions. The repository owns SQL and record mapping. Image upload concerns stay outside Ticket SQL.

## Runtime and dependencies

- Node.js 24 or newer, matching Auth and providing `node:sqlite`.
- Express 5.
- `jose` for JWT verification.
- `zod` for runtime validation.
- `multer` for bounded multipart parsing.
- Direct SQL through `DatabaseSync`; one process-wide SQLite connection.

Configuration:

- `PORT`, default `3002`.
- `JWT_SECRET`, required and at least 32 UTF-8 bytes.
- `TICKETS_DB_PATH`, default `tickets/data/tickets.sqlite`.
- `TICKETS_UPLOAD_DIR`, default `tickets/data/uploads`.

The Kubernetes Tickets deployment mounts one Tickets PVC at `/data`, sets `TICKETS_DB_PATH=/data/tickets.sqlite`, and sets `TICKETS_UPLOAD_DIR=/data/uploads`. This design intentionally remains single-replica while images use local storage.

## Ticket data model

The initial `tickets` table stores:

| Field | Rule |
|---|---|
| `id` | Server-generated UUID primary key. |
| `owner_id` | JWT subject; immutable. |
| `event_name` | Required trimmed text, 1–120 characters. |
| `description` | Required trimmed text, 1–2,000 characters. |
| `event_starts_at` | Required ISO-8601 input, stored as epoch milliseconds. |
| `event_ends_at` | Optional ISO-8601 input, stored as epoch milliseconds; must be later than start. |
| `ticket_info` | Required trimmed text, 1–1,000 characters. |
| `place` | Required trimmed text, 1–200 characters. |
| `price_cents` | Positive safe integer in USD cents. |
| `currency` | Server-owned constant `USD`. |
| `image_filename` | Unique opaque server filename; original filename is not stored. |
| `status` | `available`, `reserved`, or `sold`; new Tickets are `available`. |
| `locked_by_order_id` | Nullable future reservation owner; never set by this increment. |
| `lock_expires_at` | Nullable future reservation deadline; never set by this increment. |
| `idempotency_key` | Required client key, scoped to owner. |
| `request_fingerprint` | SHA-256 of normalized fields and uploaded image bytes. |
| `created_at` | Server epoch milliseconds. |
| `updated_at` | Server epoch milliseconds. |

Constraints include positive price, valid status, unique image filename, and unique `(owner_id, idempotency_key)`. API responses serialize stored timestamps as ISO-8601 strings, use `currency: "USD"`, and return the request-relative `imageUrl` `/ticket-images/<opaque-name>`.

A Ticket response contains only `id`, `ownerId`, listing fields, `priceCents`, `currency`, `imageUrl`, `status`, `createdAt`, and `updatedAt`. It never exposes `image_filename`, `locked_by_order_id`, `lock_expires_at`, `idempotency_key`, or `request_fingerprint`.

This increment validates timestamp syntax and start/end ordering but does not invent a future-only event rule that the accepted journeys do not define.

The API exposes `ownerId` as the only seller identifier. It never returns JWT email or other Identity-owned private data; a public seller profile can be designed when Identity owns one.

## HTTP API

### `GET /tickets`

Returns available Tickets only. Viewing or filtering never changes Ticket state.

Optional query parameters:

- `q`: case-insensitive partial match across event name, description, ticket information, and place.
- `place`: case-insensitive partial place match.
- `startsAfter`: inclusive ISO-8601 lower bound on event start.
- `startsBefore`: inclusive ISO-8601 upper bound on event start.
- `minPriceCents`: inclusive positive integer lower bound.
- `maxPriceCents`: inclusive positive integer upper bound.
- `page`: positive integer, default `1`.
- `pageSize`: positive integer, default `20`, maximum `100`.

Reject contradictory ranges. Escape SQL `LIKE` wildcard characters in user text. Order results by `event_starts_at ASC, id ASC`.

Response:

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

The initial case-insensitive `LIKE` search is deliberate for a local learning dataset. Upgrade to a dedicated read model or search engine only when measured query volume or search quality requires it.

### `GET /tickets/mine`

Returns all Tickets whose `owner_id` equals the authenticated JWT subject, including future `available`, `reserved`, and `sold` states. It accepts `page` and `pageSize` and uses newest-created-first ordering, then Ticket ID for stability. Define this route before `GET /tickets/:ticketId` so `mine` is not parsed as an ID.

### `GET /tickets/:ticketId`

Returns one existing Ticket in any state. An unavailable Ticket remains inspectable and reports its current status. A missing or malformed UUID receives `404` so callers do not need to distinguish identifier shape from absence.

### `POST /tickets`

Consumes `multipart/form-data` with:

- file field `image`;
- text fields `eventName`, `description`, `eventStartsAt`, optional `eventEndsAt`, `ticketInfo`, `place`, and `priceCents`;
- required `Idempotency-Key` header, 1–128 visible ASCII characters.

Images are limited to 5 MiB and must have a valid JPEG, PNG, or WebP signature. The service does not trust the multipart MIME type or filename. A successful first request returns `201 { "ticket": ... }`.

Idempotency is owner-scoped:

- same owner, key, and normalized request fingerprint: remove the duplicate upload and return `200` with the original Ticket;
- same owner and key but different fingerprint: remove the duplicate upload and return `409`;
- different owners may use the same key independently.

### `PATCH /tickets/:ticketId/price`

Consumes JSON:

```json
{ "priceCents": 12500 }
```

The authenticated user must own the Ticket and the Ticket must be `available`. The operation changes only `price_cents` and `updated_at`; Ticket ID, owner, content, image, and state remain unchanged. Repeating the same price is a successful idempotent state-preserving update.

Missing and non-owned Tickets both return `404`. An owned `reserved` or `sold` Ticket returns `409`. The repository performs the ownership/state guard and update as one authoritative SQLite decision so a future reservation operation can compete safely.

## Upload and database consistency

Creation uses this sequence:

1. Authenticate before accepting a file.
2. Let multipart limits reject oversized bodies early.
3. Validate fields and actual image signature.
4. Normalize parsed values and hash them with the image bytes.
5. Multer stages the upload under `TICKETS_UPLOAD_DIR/.staging`, then the service renames it within the same filesystem to a generated final filename after validation.
6. Insert the Ticket under the unique owner/idempotency constraint.
7. Commit only after the final image exists.
8. On a matching replay, delete the request's newly finalized image and return the existing Ticket.
9. On validation, conflict, or database failure, remove the request's staged/final image and expose no new Ticket.

SQLite and the filesystem cannot participate in one atomic transaction. This ordering guarantees that no committed Ticket points to an image that was never finalized. A process crash between finalizing a file and committing its Ticket can leave an unreferenced file, but never a partial listing. Orphan cleanup is deferred until accumulation is observed.

## Error contract

A centralized Express error handler returns `{ "error": "safe message" }` and logs unexpected errors without leaking internals.

| Status | Meaning |
|---|---|
| `400` | Invalid fields/query/idempotency key, contradictory filters, malformed JSON or multipart body. |
| `401` | Missing, invalid, or expired access JWT; include `WWW-Authenticate: Bearer`. |
| `404` | Ticket absent or not owned for a price update. |
| `409` | Idempotency key reused with different content; owner tries to edit a reserved/sold Ticket. |
| `413` | Uploaded image exceeds 5 MiB. |
| `415` | Uploaded content is not a supported image signature. |
| `500` | Unexpected internal failure; generic response. |

Temporary Ticket-information failures return `500`, never an empty successful list, so clients do not confuse failure with no results.

## Manual verification

No automated tests are added. Verification uses the actual service:

1. Build and typecheck Tickets.
2. Launch with temporary database/upload paths and the configured local JWT secret.
3. Use a valid Auth-compatible JWT to create a Ticket with a real supported image.
4. Repeat the same create with the same key and verify the same Ticket ID and one logical record.
5. Reuse the key with changed content and verify `409`.
6. Verify filtered and paginated available results.
7. Verify detail and My Tickets responses.
8. Update price as owner and observe the new price in later reads.
9. Attempt the update as another user and verify `404` with no change.
10. Upload an unsupported file and verify `415` with no Ticket.
11. Restart the service against the same paths and verify the Ticket and image remain available.
12. Verify no purchase, reserve, release, or sold-transition endpoint exists.

## Deferred ceiling

Local image storage requires one Tickets replica and shared process-local filesystem access. Move images to object storage only when replicas or independent deployment require it. SQLite remains appropriate for this local learning service; replace it only when real concurrency or operational requirements exceed the single-writer model.
