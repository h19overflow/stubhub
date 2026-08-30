# User Reporting and Moderation Journey — Step 1

**Status:** First buyer-to-seller reporting and review slice implemented;
user-ban enforcement and notification remain unresolved.

This document separates the implemented first slice from later moderation
capabilities. The implementation records reports and decisions only; it does not
ban a user or change Orders, Tickets, refresh tokens, or access JWTs.

Related drafts:

- [`moderation_api_and_ui.md`](../moderation_api_and_ui.md)
- [`service_communication_design_guide.md`](../service_communication_design_guide.md)
- [`moderation_service_communication.md`](../moderation_service_communication.md)

## Current capability gaps

The following capabilities are not built. Their inclusion here records the current
starting point; it does not select them as the final solution.

- A durable banned or disabled state for a user.
- An administrative ban command and its authorization policy.
- Revocation of every active refresh-token family belonging to one user.
- A committed `user.banned` fact, or equivalent fact, and an Identity event
  publication ledger.
- A local banned-user or revoked-token projection in Orders and Tickets.
- Synchronous token introspection.
- Immediate invalidation of already-issued access JWTs.

## Review a reported user

```text
Journey selected:
Review a report and decide its outcome.

Actor:
A signed-in administrator reviewing reported users.

Starting condition:
A report has been raised against a user and is available for administrative
review.

Action the actor takes:
The administrator opens the reported user's captured evidence, reads the reason
and originating Order context, and decides whether to uphold or clear the report.

Successful outcome:
- The administrator's decision and required reason are recorded.
- An upheld outcome records that the report was accepted as valid.
- A cleared outcome dismisses the report.
- Neither outcome changes the User, Orders, Tickets, refresh tokens, or access
  JWTs in this slice.

Rules not decided yet:
- Whether one report can be reopened or appealed.
- When a later upheld decision becomes an Identity account ban.
- What happens to the user's active orders, listings, and reservations.
- How and when the affected user is notified.
```

## Administrative access discussed

```text
Capability discussed:
Administrative moderation access.

Required experience:
- The moderation page is visible only to a user whose authenticated role permits
  administrative review.
- Administrative routes are protected on the server; hiding a page or link in
  the browser is not authorization.
- A controlled mechanism is needed to elevate an ordinary account to an
  administrator account.

Not decided yet:
- Who may grant or remove the administrator role.
- Whether elevation is performed through a command, migration, or another
  controlled process.
- Whether sensitive moderation actions require recent re-authentication.
- Which administrative actions must be audited.
```

## Reported customer index discussed

```text
Capability discussed:
A moderation index of customers who have reports requiring review.

Information discussed:
- Which customers have reports against them.
- The report reason or summary.
- Which completed purchase or Order each report originated from.
- Enough status information for an administrator to distinguish reports awaiting
  review from reports already blocked or cleared.

Not decided yet:
- Sorting, filtering, pagination, or priority rules.
- Whether multiple reports against one user are grouped.
- How much Order, reporter, or reported-user information may be displayed.
```

## Submit a report after a ticket purchase

```text
Journey selected:
Report another user in connection with a ticket purchase.

Actor:
The authenticated buyer who owns a completed Order.

Starting condition:
The Order is complete and contains the immutable seller identity and purchase-time
Ticket evidence captured when Tickets accepted the reservation.

Action the actor takes:
The buyer opens the completed Order, supplies a required reason, and submits a
report about that Order's seller.

Successful outcome:
- Orders authoritatively confirms the buyer, completed Order, seller, and captured
  evidence relationship.
- Identity supplies one exact seller email snapshot.
- Moderation records the report and makes it available for administrative review.
- Repeating the same logical request with the same `Idempotency-Key` returns the
  same report.

Rules not decided yet:
- The reporting time window.
- A general duplicate-report policy beyond idempotent request replay.
- How fairness, abuse prevention, appeals, and user notification are enforced.
```

## Notify the reported user

```text
Journey selected:
Inform a user that they were reported and later reviewed.

Actor:
The user named by a report.

Information the user should receive:
- That a report was submitted against them.
- The reason that may be disclosed to them.
- The review outcome: blocked or cleared.

Not decided yet:
- Whether notice is immediate or waits for administrative review.
- Whether the reporter's identity is disclosed.
- Which evidence or administrative notes are disclosed.
- How the notice is delivered and whether delivery must be retried.
- What appeal or correction path exists.
```

## Cross-service communication accepted for report creation

- Services verify Identity-signed access JWTs locally.
- Tickets returns the seller identifier and Ticket description inside its internal
  reservation response; Orders stores them as immutable purchase snapshots.
- Moderation asks Orders for one immediate internal report-context decision using
  the Order, authenticated buyer, and proposed seller identifiers.
- Moderation performs one exact internal Identity lookup for the seller email
  snapshot before committing the report.
- Temporary dependency failure returns a retryable failure and creates no report.
- `Idempotency-Key` is scoped to the authenticated reporter and protects a lost
  response after Moderation commits.

No event or Redis Stream is used to decide report eligibility. Event contracts,
ban enforcement, downstream projections, user notification, and cross-service
cancellation remain unresolved.

## Next design discussion

1. Define the exact Identity ban and refresh-token revocation transaction.
2. Define Moderation's durable enforcement work and Identity's idempotent command.
3. Define the committed user-ban fact and Orders/Tickets convergence behavior.
4. Design safe cancellation and Ticket suspension for banned buyers and sellers.
