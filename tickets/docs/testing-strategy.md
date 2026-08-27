# Tickets testing strategy

## Decisions

- Use Node.js 24's built-in `node:test` runner, matching Identity.
- Keep Tickets unit and integration tests under `tickets/tests/`.
- Compile tests with `tsconfig.test.json`; run the emitted JavaScript.
- Integration tests import the real Express app, bind an ephemeral port, and use built-in `fetch`.
- Use real Zod validation, JWT verification, Multer uploads, SQLite statements, migrations, and error handling.
- Use `TICKETS_DB_PATH=:memory:` and a disposable upload directory.
- Test observable contracts and state invariants, not private helper functions or coverage percentages.
- Keep multi-service journeys under repository-level `tests/e2e/` only after every participating service is runnable.

## Service boundary

Tickets owns listing data, seller ownership, price, authoritative availability, image storage, reservation locks, and sold state. Its tests must prove those decisions without depending on Identity or Orders processes.

Identity-issued access tokens are a cross-service contract. Tickets integration tests therefore sign representative tokens independently and exercise the real Tickets verifier. Full Identity-to-Tickets journeys remain repository-level E2E tests.

## Test layers

### Unit tests

Location: `tickets/tests/unit/`

Add a unit test only when a deterministic rule can be exercised more clearly without HTTP or SQLite. Current candidates are request schemas, token parsing, and future availability transition functions. Do not unit-test route plumbing or mirror integration assertions.

### Tickets integration tests

Location: `tickets/tests/integration/`

Each suite starts the real app on an ephemeral port. Tests use an in-memory database, real migrations, real multipart requests, and a disposable image directory. Mutable database and upload state is reset between cases.

Primary route contracts:

- create a ticket with an authenticated owner, validated fields, and a supported image;
- replay the same idempotent create without creating another ticket or image;
- reject reuse of an idempotency key for different ticket data;
- reject malformed fields or images and remove staged files;
- list only available tickets with stable filtering and pagination;
- list an authenticated user's owned tickets;
- return ticket details and stored images;
- allow only the owner to edit an available ticket;
- reject edits while a ticket is reserved or sold.

### Persistence and migration tests

These tests exercise fresh migration, repeat migration, checksum protection, constraints, and guarded state transitions directly against SQLite. Add them when the next migration or reservation transition is introduced; do not duplicate route tests.

### Cross-service and E2E tests

Tickets integration tests verify the accepted JWT contract locally. Repository-level E2E tests begin when a real journey crosses running Identity, Tickets, or Orders services. The event bus and browser are not mocked into existence for Tickets tests.

## Priority

### P0 — blocks push and merge

- JWT acceptance and rejection contract;
- owner identity taken from the verified token, never request data;
- create idempotency, including duplicate and conflicting requests;
- supported image validation and cleanup on every failed create path;
- SQLite constraints and migration integrity;
- owner-only edits and guarded availability transitions; and
- production build and startup configuration.

### P1 — blocks merge

- exact request and response errors;
- listing filters, pagination, and stable ordering;
- image serving; and
- important recovery behavior.

### P2 — add only when justified

- performance and load checks;
- built-container and local-cluster journeys; and
- broader browser compatibility.

## First implemented slice

The first suite covers `POST /tickets` because it crosses authentication, multipart parsing, validation, filesystem ownership, SQLite persistence, and idempotency. It proves:

1. authentication is required before upload processing;
2. a valid request creates one owned ticket and one retrievable image;
3. an identical idempotent request returns the original ticket;
4. different data with the same key returns conflict; and
5. an unsupported image leaves no ticket or staged file.

No placeholder suites or empty helpers are added.

## Commands

From `tickets/`:

```text
npm test
npm run test:integration
npm run test:build
```

`test:build` removes stale compiled tests, compiles source and tests, and copies migrations beside the compiled source. The test runner executes files serially because integration suites share one disposable upload root; move to per-process upload roots before enabling file-level concurrency.
