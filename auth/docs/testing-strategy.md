# Identity and authorization testing strategy

## Status

Accepted design decisions:

- Use Node.js 24's built-in `node:test` runner.
- Keep Identity unit and integration tests under `auth/tests/`.
- Keep multi-service end-to-end tests under repository-level `tests/e2e/`.
- Use versioned native Git hooks that call package scripts.
- Use GitHub Actions as the authoritative merge gate.
- Use the same built image digest for verification and deployment promotion.

Implementation is phased. Empty helpers, fake services, and placeholder E2E tests are not part of this design.

## Boundary

The Identity Service owns accounts, credentials, email verification, sign-in challenges, access-token issuance, refresh-token rotation, signout, and the authenticated user projection.

Identity proves who the caller is and signs the current `role` into an access token. Tickets, Orders, and other owning services remain responsible for authorization decisions such as role checks, resource ownership, and operation eligibility.

The testing architecture therefore covers two contracts:

1. Identity authentication behavior and security invariants.
2. Consistent token verification and authorization interpretation across services.

## Goals

The test system must detect, before deployment:

- broken request and response contracts;
- invalid authentication state transitions;
- credential, challenge, token, or cookie leakage;
- incorrect JWT validation;
- refresh-token replay and rotation failures;
- race conditions around single-use challenges and refresh tokens;
- SQLite constraint, transaction, and migration regressions;
- cross-service disagreement about token claims;
- production build, container startup, and manifest failures; and
- deployed-environment startup and readiness failures.

## Non-goals

The initial system will not:

- chase a coverage percentage;
- test every private function;
- mock every dependency;
- run containers before every commit;
- call production email providers;
- mutate production user data;
- create E2E tests before multiple real services participate; or
- hide flaky tests with automatic retries.

## Test layers

### Unit tests

Location:

```text
auth/tests/unit/
```

Unit tests verify one module or business rule without an HTTP server or external process.

Primary subjects:

- access-token creation and verification;
- refresh-token cookie parsing and attributes;
- request schemas and normalization;
- password and challenge-secret hashing; and
- small deterministic authorization policy functions when they exist.

Unit tests must remain fast and isolated. They may use real cryptography when cryptographic behavior is the contract being protected.

### Identity integration tests

Location:

```text
auth/tests/integration/
```

Integration tests import `auth/src/app.ts`, start Express on an ephemeral port, and use built-in `fetch` to exercise real request handling. They use real Zod validation, middleware, SQLite statements, transactions, JWT operations, cookies, and error handling.

Each Node test file runs in its own process. With `IDENTITY_DB_PATH=:memory:`, each file receives an isolated SQLite database. Tests within one file reset mutable tables before each case.

Planned suites:

```text
signup.test.ts
verify-email.test.ts
signin.test.ts
refresh.test.ts
signout.test.ts
current-user.test.ts
rate-limit.test.ts
migrations.test.ts
```

### Cross-service contract tests

Contract tests begin when Tickets or Orders exposes protected operations.

They verify that:

- Identity-issued tokens are accepted by downstream services;
- wrong signature, issuer, audience, algorithm, or expiration is rejected everywhere;
- `sub`, `email`, `emailVerified`, and `role` have one shared meaning;
- role checks and ownership checks remain separate; and
- stale role claims remain valid only for the documented access-token lifetime.

These tests are service integration tests, not full E2E tests.

### Built-container smoke tests

Built-container checks run against the production Identity image, not the TypeScript source process.

They verify:

- production dependencies are sufficient;
- migrations are included in the image;
- required environment configuration is enforced;
- a file-backed SQLite database can be created and migrated;
- the container becomes healthy; and
- protected endpoints reject unauthenticated requests.

### Multi-service E2E tests

Location:

```text
tests/e2e/
```

E2E tests belong to the repository because they exercise system-owned journeys across Identity, the client, Mailpit, Tickets, Orders, Redis, and Kubernetes.

Future journeys:

```text
signup -> Mailpit code -> verify -> current user
signin -> Mailpit code -> authenticate -> refresh -> signout
signin -> protected ticket purchase journey
admin token -> authorized admin operation
user token -> rejected admin operation
```

No E2E test should be added until every named component in its journey is real and runnable.

## Priority model

- **P0:** security, data integrity, authentication state, migrations, and deployment startup. Failure blocks push, merge, and deployment.
- **P1:** important error behavior, rate limiting, recovery, and user-visible contracts. Failure blocks merge.
- **P2:** broader compatibility, performance, and operational scenarios. Added only when the product reaches that need.

## Required test matrix

### Configuration and startup

P0 cases:

- missing `JWT_SECRET` prevents startup;
- a secret shorter than 32 bytes prevents startup;
- valid configuration starts successfully;
- a fresh database applies all migrations;
- an up-to-date database starts without applying migrations;
- a changed applied migration checksum prevents startup;
- a migration gap or invalid migration filename prevents startup;
- a file-backed production database can be created; and
- the compiled application serves `/health` successfully.

### Signup

P0/P1 cases:

- invalid email is rejected;
- password length boundaries are enforced;
- email is trimmed and normalized to lowercase;
- a new account returns an unverified `user` role projection;
- password hashes and other secrets never appear in the response;
- duplicate normalized emails return conflict;
- concurrent duplicate signup attempts create one account;
- a verification challenge is created;
- successful email delivery reports `emailSent: true`;
- email failure preserves the account and reports `emailSent: false`; and
- request rate limiting returns `429` with `Retry-After`.

### Verification requests

P0/P1 cases:

- invalid email is rejected;
- unknown, verified, and unverified accounts receive the same public response;
- an eligible unverified account receives a challenge;
- resend cooldown prevents premature replacement;
- a later challenge invalidates the previous challenge; and
- mail failure does not reveal account existence.

### Email verification

P0 cases:

- invalid input is rejected;
- incorrect, expired, locked, and consumed codes fail;
- five failed attempts lock the challenge;
- a challenge can be consumed only once;
- concurrent consumption produces one success;
- successful verification updates durable user state;
- successful verification returns the authentication response;
- a refresh cookie is issued;
- raw refresh tokens never appear in JSON or SQLite; and
- persisted refresh tokens are hashes.

### Password sign-in

P0/P1 cases:

- unknown email and wrong password return the same generic error;
- unverified users cannot complete sign-in;
- valid credentials request a sign-in challenge;
- email delivery failure returns a temporary-unavailability response;
- five incorrect passwords lock the account;
- a correct password during lockout remains blocked;
- lockout includes `Retry-After`;
- successful authentication after lock expiry clears failed-attempt state; and
- route rate limiting is tested separately from account lockout.

### Sign-in challenge

P0 cases:

- invalid input is rejected;
- incorrect, expired, locked, and consumed codes fail generically;
- a valid code returns the exact authentication response;
- the access token identifies the correct public user;
- the refresh token is issued only through the cookie; and
- concurrent consumption cannot produce two successful authentications.

### Access-token authentication

P0 cases:

- missing authorization header is rejected;
- wrong scheme is rejected;
- malformed or extra header segments are rejected;
- invalid signature is rejected;
- wrong issuer is rejected;
- wrong audience is rejected;
- wrong algorithm is rejected;
- expired token is rejected;
- missing or invalid claims are rejected;
- valid claims are placed in request-scoped locals;
- `/current-user` returns only the public user projection; and
- authentication failures include `WWW-Authenticate: Bearer`.

### Refresh-token rotation

P0 cases:

- missing, unknown, and expired cookies are rejected and cleared;
- a valid token returns a new access token and refresh cookie;
- rotation makes the old token unusable;
- the replacement remains in the same family;
- replaying a rotated token revokes the family;
- a replacement token fails after replay detection;
- two simultaneous refreshes cannot both establish valid continuing sessions;
- refreshed user claims come from current durable user state; and
- raw refresh tokens are never persisted or returned as JSON.

### Signout

P0/P1 cases:

- missing and invalid cookies still produce idempotent success;
- a valid cookie revokes its refresh-token family;
- the cookie is always cleared;
- repeated signout remains safe; and
- existing access tokens remain valid until their documented expiration.

### Cookies

P0 cases:

- refresh cookies are `HttpOnly`;
- refresh cookies use `SameSite=Lax`;
- refresh cookies use `Path=/`;
- `Max-Age` matches refresh-token lifetime;
- production cookies include `Secure`;
- non-production cookies omit `Secure`; and
- cleared cookies preserve security attributes and use `Max-Age=0`.

### Persistence and races

P0 cases:

- SQLite enforces user email uniqueness;
- SQLite rejects unknown roles;
- user deletion cascades to challenges and refresh tokens;
- active challenge uniqueness is enforced;
- transaction rollback leaves no partial challenge consumption;
- transaction rollback leaves no partial refresh rotation;
- family revocation affects every family member; and
- concurrent single-use operations produce only one winner.

## Test environment

Identity tests use:

```text
auth/tests/test.env
```

Required values:

```text
NODE_ENV=test
PORT=0
IDENTITY_DB_PATH=:memory:
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
EMAIL_FROM=<test sender>
JWT_SECRET=<test-only value containing at least 32 bytes>
```

Rules:

- tests never load `auth/.env`;
- tests never use `auth/data/identity.sqlite`;
- tests never use production secrets;
- integration test files use separate in-memory databases;
- E2E tests use disposable file-backed databases or disposable cluster storage;
- secrets, raw refresh tokens, passwords, and verification codes are never logged; and
- test environment values are explicit and deterministic.

## Test support

Shared support is added only after real duplication appears.

Expected eventual support:

```text
auth/tests/support/server.ts
auth/tests/support/database.ts
auth/tests/support/auth.ts
```

Responsibilities:

- `server.ts`: start and stop the app on an ephemeral port;
- `database.ts`: reset mutable tables and seed otherwise unreachable durable states; and
- `auth.ts`: create authenticated fixtures and extract refresh cookies.

Support code must not reimplement production authentication logic.

## Data setup rules

- Use public HTTP APIs when the journey itself is under test.
- Seed direct database state when setup is not the behavior being tested.
- Use real password and challenge hashing for security integration cases.
- Seed expired timestamps instead of sleeping.
- Use Node mock timers only when durable timestamps cannot express the case.
- Use `Promise.all` for race tests and assert the allowed outcome set.
- Never add retries to make race or time tests pass.

## Email testing

- Unit and normal integration tests do not depend on an external SMTP process.
- Integration tests may seed a known challenge hash when consuming a code is the behavior under test.
- Built-service and E2E tests use the existing Mailpit deployment and read messages through Mailpit's API.
- Nodemailer internals are not globally mocked.

## Quality gates

### Before commit

Purpose: fast developer feedback.

Required checks:

```text
Identity typecheck
Identity unit tests
```

Source-of-truth command:

```text
npm run check:commit
```

The versioned `.githooks/pre-commit` hook calls this command and contains no duplicated test logic.

### Before push

Purpose: complete Identity service verification.

Required checks:

```text
Identity production build
Identity unit tests
Identity integration tests
Identity migration tests
```

Source-of-truth command:

```text
npm run check:push
```

The versioned `.githooks/pre-push` hook calls this command.

Each clone requires:

```text
git config core.hooksPath .githooks
```

Local hooks improve feedback but remain bypassable. They are not the authoritative merge gate.

### GitHub Actions pull-request gate

A repository workflow must run:

```text
npm ci
workspace typecheck
workspace production build
Identity unit tests
Identity integration tests
Identity migration tests
production Identity image build
production Identity container startup
health smoke check
unauthenticated protected-route smoke check
```

Later additions:

```text
cross-service token contract tests
local-cluster E2E authentication journey
```

Required workflow checks must be protected by repository branch rules. A failed required check blocks merge.

### Deployment gate

Deployment must:

1. use the exact image digest built and verified by CI;
2. validate Kubernetes manifests;
3. confirm required Secret references exist;
4. deploy to staging;
5. wait for rollout readiness;
6. inspect startup and migration logs;
7. run health and authentication smoke checks;
8. run the Mailpit-backed E2E authentication journey; and
9. promote the same image digest.

A valid manifest is source evidence, not runtime deployment evidence.

### Post-deployment checks

Production-safe checks:

- `/health` returns `200`;
- `/current-user` without credentials returns `401`; and
- startup, migration, readiness, and error telemetry show no failure.

A complete production authentication journey requires a dedicated synthetic account, explicit secret ownership, and cleanup. It is deferred until production monitoring is in scope.

## Failure policy

- P0 failures block push, merge, and deployment.
- P1 failures block merge.
- E2E failures block deployment, not local commits.
- Flaky security tests are treated as defects.
- Automatic test retries are not used to hide instability.
- Skipped P0 tests are not accepted.
- Every fixed authentication or authorization bug adds the cheapest regression test that would have detected it.
- Coverage reports may guide investigation but do not replace contract assertions.

## Implementation phases

### Phase A: align structure and commands

- Keep `auth/tests/unit/` and `auth/tests/integration/`.
- Move E2E ownership to repository-level `tests/e2e/`.
- Remove the provisional Identity-owned E2E command.
- Add `check:commit` and `check:push` commands.
- Add shared support only when the next tests create duplication.

Acceptance:

- commands run on Windows and CI shells;
- no command silently passes because it searched the wrong directory; and
- production build behavior remains unchanged.

### Phase B: security-critical unit coverage

Implement access-token, cookie, schema, and secret tests.

Acceptance:

- malformed tokens and claims fail;
- cookie security attributes are exact;
- validation boundaries are covered; and
- secret behavior is protected without leaking secret material.

### Phase C: Identity HTTP integration coverage

Implement signup, verification, sign-in, refresh, signout, current-user, and rate-limit suites.

Acceptance:

- documented status codes and bodies are executable;
- authentication state transitions are verified through HTTP; and
- every important response and cookie transition is covered.

### Phase D: persistence and race coverage

Implement migration, constraint, transaction, replay, single-use, and concurrency cases.

Acceptance:

- removing an atomic database guard causes a test failure;
- migration tampering causes a test failure; and
- replay behavior and race outcomes are deterministic.

### Phase E: native local gates

Add package commands and `.githooks/pre-commit` and `.githooks/pre-push` wrappers.

Acceptance:

- hooks call package commands rather than duplicate them;
- commit checks remain fast; and
- push checks run the complete Identity suite.

### Phase F: GitHub Actions and container verification

Add required source, test, image, and smoke jobs.

Acceptance:

- build, test, migration, environment, image, and startup defects block merge; and
- branch protection identifies the workflow checks as required.

### Phase G: cross-service contracts and root E2E

Begin only after Tickets and Orders expose protected behavior.

Acceptance:

- services agree on JWT semantics;
- authorization policy is enforced by the owning service; and
- real multi-service journeys run against disposable infrastructure.

## Definition of done

The current-stage testing system is complete when:

- unit and integration tests are deterministic and isolated;
- tests cannot touch developer or production data;
- all current P0 Identity cases are executable;
- refresh rotation and challenge-consumption races are protected;
- migration integrity is protected;
- production compilation and container startup are verified;
- fast checks run before commits;
- full Identity checks run before pushes;
- GitHub Actions blocks broken merges;
- deployment promotes an already-tested image; and
- E2E tests exist only for real multi-service journeys.
