# User Reporting and Moderation API and UI Specification

**Status:** Accepted and implemented for the first buyer-to-seller reporting
slice. User-ban enforcement remains deliberately outside this contract.

This specification records the four public/admin API operations and three
frontend surfaces in the first slice. Exact report-creation communication is
defined in `moderation_service_communication.md`.

## Scope

### Included

- Submit a report about a user from an Order context.
- Elevate an existing user to administrator by email.
- List reported users for the administrative review page.
- Resolve one user report.
- Reported-user index and evidence-focused detail page.
- Administrative decision dialog.
- User report button and report dialog.

### Deferred

- User-ban commands, events, streams, payloads, ordering, retries, and publication
  recovery.
- Ban propagation to Orders and Tickets.
- Listing suspension, Order cancellation, and reservation release mechanics.
- Refresh-token revocation, access-JWT invalidation, and token introspection.
- Reporting windows, general duplicate-report policy, appeals, notifications,
  and long-term data retention.

## Report state vocabulary

These states belong to a **Report or Moderation Case**, not to the User. One user
may have multiple reports without one report overwriting another.

| State | Meaning | Allowed next state |
|---|---|---|
| `submitted` | A report was accepted and is waiting for administrative review | `upheld` or `cleared` |
| `upheld` | The administrator accepted the report as valid | Terminal |
| `cleared` | The administrator dismissed the report | Terminal |

`upheld` records the moderation decision only. What that decision later does to
the User account, Orders, Tickets, refresh tokens, and access JWTs is deliberately
not defined here.

## Shared API rules

- JSON bodies are strict; unknown fields are rejected.
- Error responses use `{ "error": "safe message", "code": "stable_code" }`.
- Protected routes derive the acting user from the verified access JWT.
- The browser never supplies a trusted reporter identity, administrator identity,
  or role.
- Administrative authorization is enforced by the backend. Hiding a page or
  button is not authorization.
- `POST /reports` requires one 1–128 character printable `Idempotency-Key`.
  The key is scoped to the authenticated reporter and one request fingerprint.

## API summary

| Operation | Method and path | Actor |
|---|---|---|
| Report user | `POST /reports` | Authenticated user |
| Elevate administrator | `POST /admin/users/elevate` | Administrator |
| Get reported users | `GET /admin/reported-users` | Administrator |
| Resolve user report | `POST /admin/reports/:reportId/resolve` | Administrator |

## `POST /reports`

Creates one report from an Order context.

**Authorization:** Authenticated user. The reporter is derived from the access
JWT and recorded by the server. The body does not accept `reporterUserId`,
reporter email, or reporter role.

**Header:** `Idempotency-Key: <one logical report attempt>`.

**Request:**

```json
{
  "orderId": "order-id",
  "reportedUserId": "reported-user-id",
  "reason": "Explanation of what happened"
}
```

- `orderId` identifies the purchase context.
- `reportedUserId` identifies the user being reported. The server must not trust
  this relationship merely because the browser supplied it.
- `reason` is trimmed and must contain 1 to 2000 characters.
- The browser does not submit an Order object, Ticket object, Order owner, Ticket
  owner, price, or Order state as authority.

**Success:**

```json
{
  "report": {
    "reportId": "report-id",
    "status": "submitted",
    "reporterUserId": "derived-authenticated-user-id",
    "reportedUserId": "reported-user-id",
    "orderId": "order-id",
    "reason": "Explanation of what happened",
    "createdAt": "2026-08-30T00:00:00.000Z"
  }
}
```

- `201` when the report is created or the same logical request is replayed.
- The response reporter identity is server-derived, not echoed from request data.

**Errors:**

- `400 invalid_report`: missing, malformed, empty, unknown request field, or
  invalid `Idempotency-Key`.
- `401 authentication_required`.
- `404 report_context_not_found`: Orders cannot confirm the authenticated buyer,
  completed Order, matching seller, and required snapshots, or Identity cannot
  find that seller.
- `409 idempotency_conflict`: the reporter reused the key for different input.
- `503 dependency_unavailable`: Orders or Identity cannot answer temporarily.
- `500 internal_error`.

**Accepted rule:** The authenticated buyer may report only the seller captured by
one buyer-owned completed Order. A general reporting window and duplicate-report
policy beyond request idempotency remain unresolved.

## `POST /admin/users/elevate`

Elevates one existing user to administrator by email.

**Bootstrap rule:** The first administrator is created only by a controlled seed.
There is no public “become admin” operation. After bootstrap, only an
already-authenticated administrator may elevate another existing user.
The implemented local seed command is
`npm run seed:admin --workspace @stubhub/identity -- person@example.com`; it
elevates only an existing account in the configured Identity database.

**Authorization:** Administrator only.

**Request:** Strict JSON containing email only:

```json
{
  "email": "person@example.com"
}
```

The route does not accept `userId`, `role`, permissions, or a caller-supplied
administrator identity. The only supported outcome is elevation to the fixed
`admin` role.

**Success:**

```json
{
  "user": {
    "userId": "user-id",
    "email": "person@example.com",
    "role": "admin"
  }
}
```

- `200` when the user is elevated.
- Repeating the request for an existing administrator returns the same `200`
  representation without creating another role assignment.

**Errors:**

- `400 invalid_email`.
- `401 authentication_required`.
- `403 administrator_required`.
- `404 user_not_found`.
- `500 internal_error`.

**Still unresolved:** Audit fields, whether an administrator may elevate their
own account outside the bootstrap seed, administrator removal, and whether
recent re-authentication is required.

## `GET /admin/reported-users`

Populates the reported-customer index and provides the evidence summaries needed
by the initial customer detail page.

**Authorization:** Administrator only.

**Request:** No body. Filtering, pagination, and search are deferred.

**Success:**

```json
{
  "reportedUsers": [
    {
      "user": {
        "userId": "reported-user-id",
        "emailAtReport": "reported@example.com"
      },
      "reports": [
        {
          "reportId": "report-id",
          "status": "submitted",
          "reason": "Explanation of what happened",
          "createdAt": "2026-08-30T00:00:00.000Z",
          "reporter": {
            "userId": "reporter-user-id"
          },
          "reportedUserEmailAtReport": "reported@example.com",
          "order": {
            "orderId": "order-id",
            "status": "complete"
          },
          "ticket": {
            "ticketId": "ticket-id",
            "eventName": "Event name",
            "description": "Ticket description",
            "eventStartsAt": "2026-09-30T19:00:00.000Z",
            "eventEndsAt": null,
            "place": "Venue",
            "ticketInfo": "Section and seat"
          },
          "decisionReason": null,
          "resolvedByUserId": null,
          "resolvedAt": null
        }
      ]
    }
  ]
}
```

- `200` with reported users grouped by user.
- Reports are ordered newest first inside each user.
- The initial learning scope returns enough evidence summary for both the index
  and detail page. Add pagination and a dedicated detail route only when the
  data size makes this response measurably unsuitable.

**Errors:**

- `401 authentication_required`.
- `403 administrator_required`.
- `500 internal_error`.

**Deferred:** Reporter email disclosure, pagination, filtering, search, and a
dedicated detail endpoint.

## `POST /admin/reports/:reportId/resolve`

Records the administrator's final decision for one report.

**Authorization:** Administrator only.

**Request:**

```json
{
  "decision": "uphold",
  "reason": "Administrative reason for the decision"
}
```

`decision` is exactly `uphold` or `clear`. The administrative `reason` is
required for the review record.

**Success:**

```json
{
  "report": {
    "reportId": "report-id",
    "status": "upheld",
    "decisionReason": "Administrative reason for the decision",
    "resolvedByUserId": "derived-administrator-user-id",
    "resolvedAt": "2026-08-30T00:00:00.000Z"
  }
}
```

- `200` with status `upheld` or `cleared`.
- Repeating the same terminal decision returns the existing result.
- A conflicting decision against an already terminal report is rejected.

**Errors:**

- `400 invalid_resolution`.
- `401 authentication_required`.
- `403 administrator_required`.
- `404 report_not_found`.
- `409 report_already_resolved`: the report already has a different terminal
  outcome.
- `500 internal_error`.

**Explicit boundary:** This response means the moderation decision was recorded.
It does not yet promise that a ban, token revocation, listing change, Order
change, event publication, or user notice has completed. Those contracts require
the later service-to-service design.

## Frontend surfaces

### Reported users index and evidence detail page

**Routes:**

- `/admin/reported-users` for the index.
- `/admin/reported-users/[userId]` for the evidence-focused detail page.

The index shows reported customers, open/resolved report status, report count,
and the newest report time. Selecting a customer opens the detail page.

The detail page is a moderation evidence workspace, not a generic editable
customer profile. For the selected report it shows:

- reported customer identity;
- reporter identity when the disclosure policy permits it;
- report status and timestamps;
- submitted reason;
- originating Order summary;
- related Ticket summary; and
- the action that opens the decision dialog.

Both pages require an authenticated administrator. The backend still enforces
this requirement even if client-side navigation hides the routes from ordinary
users.

### Decision dialog

The decision dialog opens from one selected report on the evidence page.

It contains:

- read-only reported customer and report identifiers;
- a choice between **Uphold report** and **Clear report**;
- a required administrative reason;
- a final confirmation action; and
- visible pending, success, and error feedback.

The dialog submits `POST /admin/reports/:reportId/resolve`. It disables repeated
submission while one request is pending. Closing the dialog before confirmation
changes nothing.

The UI must describe an upheld result as a recorded moderation decision until
the later enforcement contract defines when account banning has completed.

### User report button and dialog

The report button appears in the relevant Order or purchase view only when the
current UI eligibility rules allow reporting. The backend remains authoritative
and may still reject the submission.

Selecting the button opens a report dialog showing read-only Order and Ticket
context plus:

- the user being reported;
- a required reason field;
- submit and cancel actions; and
- pending, success, and error feedback.

The dialog submits `POST /reports` with `orderId`, `reportedUserId`, and `reason`.
It never submits the authenticated reporter identity. Cancelling or closing the
dialog before submission creates no report.

## Related communication documents

- Reusable guide:
  [`service_communication_design_guide.md`](service_communication_design_guide.md)
- Moderation working specification:
  [`moderation_service_communication.md`](moderation_service_communication.md)

## Next design session

Design the enforcement that may follow an upheld report:

1. Define Identity's authoritative ban and refresh-token revocation transaction.
2. Define Moderation's durable, idempotent enforcement request.
3. Define the committed user-ban fact and downstream convergence.
4. Work through duplicates, ordering, partial failure, and recovery before naming
   streams or events.

The accepted report-creation communication is defined in
[`moderation_service_communication.md`](moderation_service_communication.md).
