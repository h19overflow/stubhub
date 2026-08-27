# Common Workspace Package Decision Guide

**Status:** Accepted guidance for deciding what belongs in `@stubhub/common`.

`@stubhub/common` is a private npm workspace for technical contracts that must
behave identically in multiple backend services. It is not a business service,
a database owner, or a general utility drawer.

The goal is not to eliminate every duplicated line. The goal is to centralize
cross-service protocol behavior when divergence would be a bug, while preserving
service ownership and independent business evolution.

## Core decision rule

A candidate belongs in Common only when all three statements are true:

1. At least two real backend consumers need it now.
2. Those consumers require the same behavior and the same failure contract.
3. No single service owns the behavior as a business decision.

If any statement is false, keep the code in its owning service.

A useful shorthand is:

```text
Two real consumers + one invariant + no domain owner = Common candidate
```

Do not extract code for a hypothetical future consumer. Implement it locally for
the first consumer and reconsider it when the second real consumer appears.

## What Common owns today

The accepted initial scope is access-token authentication plumbing:

- `UserRole`, `AccessTokenClaims`, and `AuthenticatedUser` transport types;
- the access-token algorithm, issuer, audience, lifetime, and secret loading;
- access-token verification and claim validation; and
- Express `requireAuth` middleware, including its exact unauthorized response.

Identity remains the only service that issues access tokens. Common defines the
cross-service token contract, but Identity owns authentication workflows.

Tickets consumes the token-verification contract. Orders should depend on Common
only when it gains a real authenticated route; adding an unused dependency now
would be speculative.

The browser client must not depend on this server package because Common reads
server secrets and contains backend middleware. Client response parsing remains
at the browser's untrusted network boundary.

## What must stay service-owned

Common must not contain code that owns or changes a service's business state.
Keep the following local:

### Identity

- registration, sign-in, sign-out, and account rules;
- credential validation and password hashing;
- access-token issuance decisions;
- refresh-token creation, hashing, persistence, rotation, and revocation;
- refresh cookies and session behavior;
- email challenges and rate limits;
- Identity routes, repositories, migrations, and database records; and
- the Identity-owned public account model.

### Tickets

- listing fields and validation;
- ticket ownership and edit authorization;
- availability, reservation, release, and sold-state decisions;
- idempotency behavior;
- ticket repositories, migrations, and database records; and
- image validation, storage, and upload errors.

### Orders

- purchase eligibility and order state transitions;
- captured prices;
- expiration and payment decisions;
- reservation coordination;
- Orders repositories, migrations, and database records; and
- payment-attempt or expiration-worker behavior.

Services never share domain models or database access through Common. Cross-
service records communicate using explicit IDs and contracts instead.

## Decision questions

Ask these questions before proposing an addition.

### 1. Is the duplication semantic or only visual?

Identical-looking code is not necessarily the same rule.

A price comparison in Tickets and a money comparison in Orders may currently
look identical. Tickets owns listing-price rules; Orders owns captured order
amounts. Either service may need to change independently, so those comparisons
stay local.

JWT verification is different. Every backend consumer must interpret the same
Identity-issued token identically. Different issuer, audience, claim, or error
behavior would be a protocol defect, so verification belongs in Common.

### 2. Who approves a future change?

Ask whether one service owner could reasonably change the behavior without
coordinating with other services.

- If one service can change it independently, it stays in that service.
- If every consumer must coordinate because the behavior is one shared
  protocol, it is a Common candidate.

### 3. Does it require service-owned data?

Code that imports a service repository, database, migration, or state machine
almost always stays local.

Good Common code usually accepts ordinary inputs and returns ordinary results:

```ts
verifyAccessToken(header): Promise<AuthenticatedUser | null>
```

It does not query Identity to decide whether an account exists, and it does not
query Tickets or Orders to authorize a business transition.

### 4. Must the failure behavior also be identical?

Sharing only the success path is insufficient. Specify:

- invalid input behavior;
- thrown errors versus result values;
- HTTP status and response body when middleware is involved;
- required response headers;
- retry or idempotency behavior, if applicable; and
- whether failures may expose internal details.

If services need different failures, the candidate is probably service-owned or
the proposed API is too broad.

### 5. Is sharing worth the coupling?

A Common change affects every consumer. That is valuable when consistency is
required and harmful when services need independent policies.

Do not share a tiny helper merely to remove two or three duplicated lines. Share
the invariant when one corrected implementation is safer than several copies.

## Candidate examples

| Candidate | Decision | Reason |
|---|---|---|
| JWT claim types and verification | Common | Every backend must interpret Identity tokens identically. |
| `requireAuth` middleware | Common | The authentication header, verification, user locals, and 401 contract must match. |
| Request correlation-ID middleware | Consider after a second consumer | It is technical plumbing if the propagation contract is identical. |
| Standard HTTP error envelope | Consider later | Extract only after multiple services accept the same exact error contract. |
| Versioned event envelope or event types | Consider after event design | Share only accepted, versioned contracts; do not invent events from Common. |
| Sign-up validation | Identity | Identity owns account creation. |
| Refresh-token persistence | Identity | Identity owns session rotation and revocation. |
| Ticket creation schema | Tickets | Tickets owns listing rules. |
| Ticket or Order database model | Never Common | Each service owns its data and persistence. |
| Order expiration rule | Orders | Orders owns lifecycle eligibility and transitions. |
| Utility used by one service | Keep local | There is no current cross-service invariant. |
| Service ports or deployment URLs | Configuration | Runtime configuration is not reusable application code. |

## Proposal template

Use this template before adding an export to Common:

```text
Candidate:
  What code, type, or protocol might be shared?

Current consumers:
  Which two or more backend services need it today?

Shared invariant:
  What must remain identical across those consumers?

Failure contract:
  What are the exact invalid-input, error, status, header, and response rules?

Owner:
  Why is this a cross-service technical contract rather than one service's
  business responsibility?

Public exports:
  List the exact functions, types, constants, and signatures consumers import.

Dependencies:
  List required runtime and development packages. Explain why each is needed.

Explicit non-goals:
  List related business rules, persistence, routes, and future behavior that
  must remain outside Common.

Change policy:
  State whether contract changes are compatible, breaking, or versioned.

Verification:
  Name the consumer builds and runtime journeys proving the shared contract.
```

A proposal is incomplete when it says only "these files are duplicated." It
must identify the shared invariant, owner, public API, failure behavior, and
non-goals.

## Review checklist

Before accepting a Common change, verify:

- there are at least two current consumers;
- every export serves the named shared invariant;
- no service database, repository, domain model, or state machine moved;
- the package does not import another service's source code;
- browser code cannot import server secrets or middleware;
- the public API is smaller than the extracted implementation;
- obsolete local implementations and imports are removed in one clean cutover;
- editors and consumer typechecks resolve Common without generated `dist` files;
- runtime builds still compile and package Common's JavaScript output;
- Docker runtime images include the workspace package target;
- existing consumer behavior and failure contracts remain verified; and
- unrelated helpers were not added "while creating Common."

## Growth and package splitting

Keep one small Common package while its contents share the same consumers and
reason to change. Do not create subpackages or a package hierarchy in advance.

Split Common only when unrelated groups emerge with genuinely different
consumers or release policies. For example, stable authentication plumbing and
versioned event contracts might eventually justify separate packages. That
split should follow real pressure, not anticipated organization.

## Security note

Common is a code-sharing boundary, not a security boundary. With HS256, every
service that verifies tokens possesses the shared secret and is technically
capable of signing them. Moving verification into Common does not create that
capability.

If the project later requires stronger trust separation, change the token
architecture: Identity holds an asymmetric private signing key, while consuming
services receive only the public verification key. That is a security-design
change, not a Common-package refactor.

## Final principle

Prefer consistency for shared protocols and independence for business rules.
Some duplication is cheaper and safer than coupling. Extract only after a
second real consumer proves that one invariant must remain identical.
