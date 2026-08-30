# Moderation Service-to-Service Communication Specification

**Status:** Report creation, administrator elevation, local review reads, and
local decisions are accepted and implemented. Ban enforcement communication
remains proposed or unresolved as labeled below.

This document applies the FACTS framework from
[`service_communication_design_guide.md`](service_communication_design_guide.md)
to the reporting and moderation feature. It defines only the implemented
report-creation internal paths; event payloads, Redis stream names, consumer
groups, and ban-enforcement persistence remain deferred.

## Status legend

| Label | Meaning |
|---|---|
| **Accepted** | Chosen during the current design discussion |
| **Proposed** | Recommended working choice that still needs explicit review |
| **Unresolved** | Required decision that has not been made |

## Accepted service boundaries

| Boundary | Authoritative ownership |
|---|---|
| Identity | Users, email, roles, administrator elevation, account status, credentials, refresh-token families, and access-token issuance |
| Moderation | Reports, Moderation Cases, submitted reason, captured evidence, review status, administrator decision, and decision reason |
| Orders | Order ownership, Order state, captured purchase information, and payment state |
| Tickets | Listing ownership, Ticket information, availability, reservation lock, and sold state |
| `common` package | Generic access-token verification and reusable authorization middleware mechanics; no business records or canonical moderation policy |

**Accepted:** Moderation owns everything about this moderation feature that is
not already authoritative business data of Identity, Orders, or Tickets. It does
not own their databases or replace their decisions.

## Accepted authorization boundary

- Services verify Identity-signed access JWTs locally through shared `common`
  mechanics. Routine route authorization does not call Identity.
- The authenticated `userId` and role come from verified claims, never the
  browser body, query, path, or a custom identity header.
- The backend protects administrator operations even when the client hides pages
  and buttons.
- Administrator elevation remains an Identity operation because Identity owns
  email and role.
- No general Identity operation lists the whole user database for Moderation.
  Exact user lookup uses a known `userId` or the elevation command's exact email.

**Accepted:** Keep the current `user` and `admin` role check instead of adding a
role-to-authority system immediately. If differentiated administrators are added
later, `common` may provide a generic `requireAuthority()` helper while the
service owning an operation defines which authority it requires.

## Accepted evidence classification

| Moderation field | FACTS classification | Authoritative source | Read-time dependency |
|---|---|---|---|
| `reportId` | Moderation-owned | Moderation | None |
| submitted `reason` | Moderation-owned reporter statement | Moderation | None |
| Report or case status | Moderation-owned | Moderation | None |
| Administrator decision and reason | Moderation-owned | Moderation | None |
| `reporterUserId` | External identifier | Identity identity, derived from authenticated claim | None after capture |
| `reportedUserId` | External identifier | Identity identity; relationship to the purchase must be validated separately | None after capture |
| `reportedUserEmailAtReport` | Historical snapshot | Identity | None after capture |
| `orderId` | External identifier | Orders | None after capture |
| `orderStatusAtReport` | Historical snapshot | Orders | None after capture |
| Purchase-time Ticket information | Historical immutable snapshot | Orders' captured Ticket snapshot, originally accepted from Tickets | None after capture |

**Accepted:** The reported-user index and evidence detail page read from
Moderation after the evidence has been captured. They do not fan out to Identity,
Orders, and Tickets for every page row.

The email field must be named and presented as a report-time snapshot. It must
not be described as the user's current email.

## Accepted business outcomes affecting later communication

- A submitted report changes no User, Order, or Ticket state.
- Clearing a report changes only the Moderation Case.
- A final user-level ban applies to all available listings owned by that user,
  not only the reported listing.
- Listings and historical records are suspended or transitioned, not physically
  deleted.
- An unpaid pending Order owned by a banned buyer is cancelled and its exact
  matching Ticket lock is released safely.
- An unpaid pending Order for a banned seller's reserved listing is cancelled,
  and the matching Ticket becomes suspended rather than available.
- A `payment_processing` Order resolves its provider result before any Ticket
  release. Confirmed success completes the Order; uncertain payment never causes
  immediate release.

The communication and recovery mechanisms that produce these outcomes are still
partly unresolved below.

## Communication decision matrix

| Interaction | FACTS result | Status | Candidate communication | Why | Failure boundary |
|---|---|---|---|---|---|
| Authenticate a public or admin request | Current signed claim required before route execution | **Accepted** | Local JWT verification, no service call | Identity already signed the claim; a network call adds availability coupling without a new business answer | Invalid claim rejects; temporary Identity outage does not invalidate an otherwise valid signed token |
| Validate the reporter's relationship to an Order | Orders owns current Order ownership and state; report acceptance needs an immediate answer | **Accepted** | Moderation calls `POST /internal/orders/report-context` with `orderId`, authenticated buyer ID, and proposed seller ID | Moderation must not accept browser assertions about Order ownership or eligibility | A missing, non-complete, unowned, seller-mismatched, or legacy Order rejects without disclosing which predicate failed; temporary failure returns `503` and creates no report |
| Obtain purchase-time Ticket evidence | Historical snapshot is sufficient | **Accepted** | Tickets includes seller ID and description in the reservation result; Orders stores and returns the immutable Ticket snapshot in report context | Current Tickets data could have changed and is unnecessary for evidence | Legacy Orders without required snapshots are not reportable; no live Tickets read occurs during report creation |
| Prove the reported user is connected to the purchase | Orders owns the captured seller relationship for this buyer-to-seller slice | **Accepted** | Orders compares the requested seller ID with its immutable `sellerUserId` snapshot | The buyer may report only the seller of a buyer-owned completed Order | A browser-supplied mismatch receives the same non-disclosing `404 report_context_not_found` result |
| Capture reported-user email evidence | Historical Identity snapshot | **Accepted** | Moderation calls `GET /internal/users/:userId` after Orders validates the seller | Avoids listing all users and removes Identity from later evidence-page reads | Identity absence rejects report context; temporary failure returns `503` and creates no report |
| Read reported-user index and evidence detail | All required evidence is locally owned or captured | **Accepted** | Moderation local read only | Avoids N+1 service fan-out and preserves historical evidence | Temporary Moderation failure is not an empty report list |
| Elevate another administrator by email | Identity owns email and role; immediate result required | **Accepted** | Browser calls the protected Identity elevation operation directly | Moderation has no role ownership and adds no useful decision | Identity returns elevated, existing-admin replay, not found, unauthorized, or temporary failure |
| Clear a report | Moderation owns the case decision; no other state must change | **Accepted** | Moderation local transaction only | No User transition occurs and no consumer requirement has been identified | Repeated same decision returns existing result; conflicting terminal decision is rejected |
| Record an upheld report | Moderation owns the case decision | **Accepted** | Moderation local transaction | The admin API records a decision even though enforcement may complete later | The response must not falsely claim account, token, Order, or Ticket enforcement completed |
| Apply an upheld decision to the User account | Identity owns account ban and refresh-token revocation | **Proposed** | Moderation retains durable enforcement work and repeats one idempotent ban command to Identity | A temporary Identity outage must not lose an upheld decision | Stable enforcement identity returns one applied/replayed outcome; unknown response remains retryable |
| Inform Orders and Tickets of a committed User ban | Identity owns the committed account transition; consumers may converge later | **Proposed** | Identity publishes one committed user-ban fact after its local ban transaction | The ban is already authoritative; downstream convergence should not undo it or block the admin decision indefinitely | At-least-once consumers require stable message identity, duplicate suppression, pending recovery, and entity ordering rules |
| Enforce banned-buyer Orders | Orders owns Order transitions | **Proposed** | Orders consumes the committed ban fact into a local banned-user projection and durable cancellation work | New and pending Order behavior must be decided locally without runtime Identity introspection | Duplicate ban delivery is harmless; processing payment remains protected until provider resolution |
| Suspend available listings owned by a banned seller | Tickets owns Ticket transitions | **Proposed** | Tickets consumes the committed ban fact into a local banned-user projection and changes eligible `available -> suspended` | Tickets must enforce from its current authoritative state | Duplicate or late ban delivery leaves sold/suspended state unchanged and cannot overwrite another transition |
| Cancel a banned seller's reserved sale and suspend the Ticket | Orders owns Order cancellation; Tickets owns reservation and suspension | **Unresolved** | Requires a coordinated request/fact flow using the exact `orderId` and `lockedByOrderId` guard | Neither service may directly write the other's state, and payment processing may already be unresolved | Must define one recovery owner, safe retry result, cancellation evidence, and behavior when responses or facts are lost |

## Accepted report-creation interaction card

```text
Interaction:
Create one Order-linked report with durable moderation evidence.

Business function:
Accept a report only when the authenticated reporter, reported user, Order, and
Ticket relationship satisfies the reporting policy.

Initiator:
Moderation after receiving POST /reports.

Authoritative owners:
Orders for Order ownership/state, captured seller identity, and purchase data.
Tickets for the seller and listing data captured in Orders during reservation.
Identity for the exact reported-user identity and email.
Moderation for report reason, idempotency, and accepted case creation.

Required currency:
Current authoritative eligibility decision.
Historical Order and Ticket evidence snapshot.
Historical reported-user email snapshot.

Timing:
Eligibility and the exact Identity email snapshot must both succeed before report
acceptance.

Success:
Moderation commits one submitted report with external identifiers and labeled
historical evidence.

Business rejection:
Reporter is not eligible, Order is not eligible, reported user is unrelated, or
required context does not exist.

Temporary failure:
A required owner cannot answer. Do not pretend the relationship is invalid.

Unknown outcome:
The browser repeats the same logical request with the same `Idempotency-Key`.
Moderation scopes the key to the authenticated reporter, compares the stored
request fingerprint, and returns the same report after a lost response.

Data excluded:
Caller-supplied reporter identity, trusted Order state, trusted Ticket ownership,
current Ticket availability as historical evidence, credentials, tokens, and
full User/Order/Ticket records.
```

## Proposed upheld-report enforcement card

```text
Interaction:
Apply an upheld Moderation decision to the User account.

Business function:
Ensure an accepted ban decision eventually becomes authoritative Identity
account enforcement even when Identity is temporarily unavailable.

Initiator:
Moderation durable enforcement capability.

Authoritative owner:
Identity.

Required decision:
Account changed to banned or already banned, and all active refresh-token
families revoked under the same authoritative operation.

Timing:
The Moderation decision may commit before enforcement completes. Enforcement
must continue durably until Identity returns a definitive result.

Proposed communication:
Idempotent internal command using one stable enforcement identity.

Success:
Identity returns applied or replayed banned outcome.

Temporary or unknown result:
Moderation retains the same enforcement work and retries. It never creates a new
logical ban command merely because the response was lost.

Downstream fact:
After Identity commits, a user-ban fact may inform Orders and Tickets. Exact
name, version, payload, ordering key, and stream are deferred.
```

## Failure semantics that are already required

### Business rejection

A definitive owner response such as ineligible Order relationship or unrelated
reported user creates no report. Rejection must not be converted into retryable
unknown work.

### Temporary dependency failure

Temporary failure is not the same as “not found,” “not eligible,” an empty admin
index, or a cleared report. The caller receives a retryable failure unless the
owning service has already accepted durable responsibility.

### Unknown state-changing outcome

A lost response after Moderation or Identity may have committed requires replay
of the same logical operation. A new identifier must not create a duplicate
report, decision, or ban.

### Duplicate committed fact

Orders and Tickets must assume at-least-once delivery. A repeated user-ban fact
must not cancel twice, release another Order's lock, recreate a listing, or emit
conflicting results.

### Late or out-of-order observation

The consuming service decides from its current authoritative state. Tickets must
use exact Ticket state and `lockedByOrderId`; Orders must protect
`payment_processing`, `complete`, and other terminal states. Delivery order never
becomes business authority.

## Explicit non-choices

- No direct database access across services.
- No generic list-all-users operation for Moderation.
- No Identity network call merely to verify a signed JWT.
- No event used to decide immediate report eligibility.
- No internal service paths beyond the exact report-context and user lookup
  operations defined for report creation.
- No accepted user-ban event name, version, payload, stream, consumer group, or
  retention policy yet.
- No `user.cleared` fact. A cleared report is a Moderation Case transition and
  does not reactivate a banned User.
- No unban or appeal communication.
- No synchronous token introspection.
- No assumption that a local banned-user projection is the Identity database.

## Next decisions in order

The first report-creation decisions are accepted: buyer-to-seller only, immutable
seller and Ticket snapshots in Orders, synchronous exact Identity email capture,
and reporter-scoped `POST /reports` idempotency.

Next:

1. Define Moderation's enforcement work record and Identity's idempotent ban
   command result.
2. Define the minimum committed user-ban fact and each consumer's duplicate,
   ordering, and pending-recovery behavior.
3. Design the cross-owner cancellation flow for a banned seller's reserved Ticket
   without releasing a processing or mismatched Order.

Do not create ban event contracts or enforcement sequence diagrams before these
remaining decisions are accepted.
