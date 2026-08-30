# Commerce Data and Consistency — Step 8

**Status:** Proposed design for review. This is not yet an accepted contract.

## Purpose

This document assigns durable records, constraints, local transaction boundaries, recovery work, and retry rules for the accepted commerce contracts. It preserves separate Orders and Tickets authority: neither service reads or writes the other's database, and no cross-service foreign key exists.

Backend timestamps are stored as epoch milliseconds and exposed as ISO-8601 strings. Identifiers are opaque text identities. Monetary values are positive integer cents in USD.

## Ownership summary

| Record or behavior | Owner | Authority |
|---|---|---|
| Ticket listing, availability, reservation owner, reservation deadline, sold state | Tickets | Tickets database |
| Purchase idempotency and interrupted purchase recovery | Orders | `purchase_operations` |
| Order lifecycle, captured amount, fixed deadline, immutable Ticket snapshot | Orders | `orders` |
| Payment Attempt lifecycle and application reconciliation schedule | Orders | `payment_attempts` |
| Deterministic provider acceptance/decline state | Local provider boundary inside Orders | `local_provider_payments` in the Orders SQLite file, committed through a separate provider transaction boundary |
| Completion and expiration publication recovery | Orders | `order_event_publications` |
| Tickets duplicate consumption and diagnostic convergence outcome | Tickets | `processed_order_events` |
| Expiration, purchase recovery, provider reconciliation, publication, and pending-entry recovery | Owning service workers | Durable state scans, never process timers |

## Orders data

### `purchase_operations`

This record exists before an Order. It owns purchase-start idempotency, the Orders-allocated identity and deadline, partial-reservation recovery, and the final non-payable rejection when no Order is exposed.

```sql
CREATE TABLE purchase_operations (
  order_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL
    CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  request_fingerprint TEXT NOT NULL
    CHECK (length(request_fingerprint) > 0),
  ticket_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL
    CHECK (state IN ('reserving', 'completed', 'releasing', 'rejected')),
  rejection_code TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_retry_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  UNIQUE (user_id, idempotency_key),
  CHECK (
    (state = 'rejected' AND rejection_code IS NOT NULL AND length(trim(rejection_code)) > 0)
    OR (state <> 'rejected' AND rejection_code IS NULL)
  ),
  CHECK (
    (state IN ('reserving', 'releasing') AND next_retry_at IS NOT NULL)
    OR (state IN ('completed', 'rejected') AND next_retry_at IS NULL)
  )
) STRICT;

CREATE INDEX purchase_operations_due_retry
  ON purchase_operations(next_retry_at, order_id)
  WHERE state IN ('reserving', 'releasing');
```

The validated request fingerprint is the normalized `ticketId`; user scope comes from the unique key and authenticated identity. `order_id`, `user_id`, `idempotency_key`, `request_fingerprint`, `ticket_id`, `expires_at`, and `created_at` are immutable after insert. The repository exposes no general update for them; a database update guard rejects changes to those columns. State helpers may change only state, rejection code, retry diagnostics, and `updated_at`.

State meanings:

| State | Meaning |
|---|---|
| `reserving` | Orders has accepted durable responsibility and is obtaining or confirming the exact Tickets reservation. No payable Order is exposed yet. |
| `completed` | The matching pending Order and reservation exist; retries return that Order. |
| `releasing` | The fixed deadline passed before a valid pending Order was committed; Orders is obtaining a definitive guarded release result. |
| `rejected` | Reservation was definitively rejected, or recovery release reached a definitive safe outcome. No Order is payable. `rejection_code` preserves the final public business result. |

`expires_at` is fixed when the operation is inserted. Retry never extends it. `retry_count`, `next_retry_at`, and `last_error` are operational data, not business state.

### Rebuilt `orders`

The clean-cutover Orders table removes `idempotency_key` and `request_fingerprint`; purchase idempotency belongs only to `purchase_operations`. It adds the immutable Ticket snapshot required by order history.

```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'payment_processing', 'complete', 'expired')),
  expires_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  ticket_event_name TEXT NOT NULL,
  ticket_event_starts_at INTEGER NOT NULL,
  ticket_event_ends_at INTEGER
    CHECK (ticket_event_ends_at IS NULL OR ticket_event_ends_at > ticket_event_starts_at),
  ticket_place TEXT NOT NULL,
  ticket_info TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
) STRICT;

CREATE INDEX orders_buyer_history
  ON orders(user_id, created_at DESC, id)
  WHERE status IN ('pending', 'payment_processing', 'complete');

CREATE INDEX orders_due_pending
  ON orders(expires_at, id)
  WHERE status = 'pending';
```

The snapshot fields and captured amount/currency/deadline never update. Lifecycle helpers update only status, version, and `updated_at`. A database update guard rejects changes to `user_id`, `ticket_id`, amount, currency, deadline, snapshot fields, and `created_at` after insert.

There is deliberately no foreign key from `orders.ticket_id` to Tickets and no foreign key from `purchase_operations.order_id` to `orders.id`: the operation must exist before the Order. The operation-to-Order completion invariant is enforced by the one Orders transaction that inserts the Order and marks the operation completed.

### Rebuilt `payment_attempts`

The existing safe provider reference, failure code, idempotency fields, and one-processing/one-succeeded constraints remain. The table adds the validated local provider scenario and durable reconciliation schedule.

```sql
CREATE TABLE payment_attempts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'succeeded', 'failed')),
  provider_scenario TEXT NOT NULL
    CHECK (provider_scenario IN (
      'local.success',
      'local.decline',
      'local.processing-success',
      'local.processing-decline'
    )),
  provider_reference TEXT
    CHECK (provider_reference IS NULL OR length(trim(provider_reference)) BETWEEN 1 AND 255),
  failure_code TEXT
    CHECK (failure_code IS NULL OR length(trim(failure_code)) BETWEEN 1 AND 100),
  idempotency_key TEXT NOT NULL
    CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) > 0),
  reconcile_attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (reconcile_attempt_count >= 0),
  next_reconcile_at INTEGER,
  last_reconcile_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  UNIQUE (order_id, idempotency_key),
  CHECK (
    (status = 'processing' AND failure_code IS NULL
      AND next_reconcile_at IS NOT NULL)
    OR (status = 'succeeded' AND provider_reference IS NOT NULL AND failure_code IS NULL
      AND next_reconcile_at IS NULL)
    OR (status = 'failed' AND failure_code IS NOT NULL
      AND next_reconcile_at IS NULL)
  )
) STRICT;

CREATE UNIQUE INDEX payment_attempts_one_processing_per_order
  ON payment_attempts(order_id)
  WHERE status = 'processing';

CREATE UNIQUE INDEX payment_attempts_one_succeeded_per_order
  ON payment_attempts(order_id)
  WHERE status = 'succeeded';

CREATE INDEX payment_attempts_due_reconciliation
  ON payment_attempts(next_reconcile_at, id)
  WHERE status = 'processing';
```

The payment fingerprint is derived from the accepted `paymentMethodToken`. The token is a safe local scenario, not raw payment data. The repository never changes scenario, idempotency key, fingerprint, Order identity, or creation time.
A processing attempt may have a null provider reference before submission or a non-null safe reference after an unresolved provider response. When the provider returns that reference, Orders persists it while keeping `failure_code` null and `next_reconcile_at` non-null.

### `local_provider_payments`

The local deterministic provider uses the Orders SQLite connection through its own transaction boundary. Its provider transaction never participates in the same transaction as Order or Payment Attempt state, even when hosted in the same process. This deliberately preserves the provider/local-state crash window that real payment integration must handle.

```sql
CREATE TABLE local_provider_payments (
  id TEXT PRIMARY KEY,
  payment_attempt_id TEXT NOT NULL UNIQUE,
  provider_idempotency_key TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) > 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  status TEXT NOT NULL
    CHECK (status IN ('processing', 'succeeded', 'declined')),
  planned_terminal_outcome TEXT NOT NULL
    CHECK (planned_terminal_outcome IN ('succeeded', 'declined')),
  resolve_at INTEGER NOT NULL,
  failure_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  CHECK (
    (status = 'processing' AND resolve_at > created_at AND failure_code IS NULL)
    OR (status = 'succeeded' AND planned_terminal_outcome = 'succeeded'
      AND failure_code IS NULL AND updated_at >= resolve_at)
    OR (status = 'declined' AND planned_terminal_outcome = 'declined'
      AND failure_code IS NOT NULL AND updated_at >= resolve_at)
  )
) STRICT;

CREATE INDEX local_provider_payments_due_resolution
  ON local_provider_payments(resolve_at, id)
  WHERE status = 'processing';
```

The provider idempotency key is stable for one Payment Attempt and is reused on every submission/reconciliation retry. `payment_attempt_id` is also unique, so one attempt cannot become two provider payments even if a caller changes the provider key incorrectly. The request fingerprint covers attempt identity, amount, currency, and selected scenario; reuse with different data is rejected.

Local behavior is deterministic:

| Scenario | Initial provider record | Planned terminal behavior |
|---|---|---|
| `local.success` | `succeeded`, `resolve_at = created_at` | Immediate success. |
| `local.decline` | `declined`, `resolve_at = created_at`, safe failure code | Immediate decline. |
| `local.processing-success` | `processing`, future fixed `resolve_at` | At or after `resolve_at`, provider lookup/resolution changes it once to `succeeded`. |
| `local.processing-decline` | `processing`, future fixed `resolve_at` | At or after `resolve_at`, provider lookup/resolution changes it once to `declined` with a safe failure code. |

The planned outcome and `resolve_at` are immutable. Provider resolution uses current provider state plus the fixed deadline; it never follows a browser timer. Repeated submit or lookup returns the same provider record.

### Orders event publication ledger (outbox pattern)

The existing `order_event_publications` concepts remain: stable message identity, aggregate type/identity/version, event type/version, JSON payload, publication progress, retry diagnostics, and uniqueness for one fact at one aggregate version. The Order terminal transition and its event publication ledger message commit in the same Orders transaction.

Orders is not an event consumer in this slice. Historical migration `004_create_inbox_messages.sql` remains byte-for-byte unchanged because the migration ledger verifies applied files and checksums. Historical migration `008_drop_inbox_messages.sql` removes the unused Orders processed-event table. Forward migration [`010_rename_outbox_messages.sql`](../../orders/migrations/010_rename_outbox_messages.sql) renames `outbox_messages` to `order_event_publications`, preserves every publication row, and recreates its due index. No dormant consumer abstraction remains.

The historical definitions in `003_create_outbox_messages.sql` and `002_rebuild_ticket_locks_and_inbox.sql` remain byte-for-byte unchanged; only the forward migrations in this document rename their tables and indexes.

## Tickets data

### Rebuilt Ticket state constraint

The Tickets table retains listing fields and creation idempotency. Its availability/lock constraint is rebuilt so every state has one valid lock shape:

```sql
CHECK (
  (status = 'available'
    AND locked_by_order_id IS NULL
    AND lock_expires_at IS NULL)
  OR
  (status = 'reserved'
    AND locked_by_order_id IS NOT NULL
    AND lock_expires_at IS NOT NULL)
  OR
  (status = 'sold'
    AND locked_by_order_id IS NOT NULL
    AND lock_expires_at IS NULL)
)
```

```sql
CREATE UNIQUE INDEX tickets_one_per_order
  ON tickets(locked_by_order_id)
  WHERE locked_by_order_id IS NOT NULL;
```

A new Ticket starts available with both lock fields null. Reservation atomically changes available to reserved and sets exact Order identity and deadline. Guarded release changes matching reserved to available and clears both lock fields. Guarded sale changes matching reserved to sold, retains the matching Order identity for durable diagnosis/idempotency, and clears the deadline. One Order identity cannot reserve or own more than one Ticket.

The reservation command compares all three identity fields:

- available: reserve with requested Order identity/deadline and return the current accepted price/snapshot;
- reserved by the same Order with the same deadline: exact replay;
- reserved by the same Order with another deadline: reservation conflict;
- reserved by another Order or sold: unavailable.

### Tickets processed-event ledger (inbox pattern)

Tickets owns the only processed-event ledger needed by this slice.

```sql
CREATE TABLE processed_order_events (
  consumer TEXT NOT NULL,
  message_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL CHECK (event_version > 0),
  aggregate_id TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL CHECK (aggregate_version > 0),
  ticket_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'sold',
    'released',
    'already_sold',
    'already_available',
    'not_matching',
    'missing'
  )),
  processed_at INTEGER NOT NULL,
  PRIMARY KEY (consumer, message_id)
) STRICT;

CREATE INDEX processed_order_events_processed
  ON processed_order_events(processed_at, consumer, message_id);

CREATE INDEX processed_order_events_aggregate_diagnostics
  ON processed_order_events(aggregate_id, aggregate_version, processed_at);
```

`consumer` is the stable `tickets-order-convergence` capability identity, not a running instance name. Event metadata and outcome provide durable local diagnostics without copying user, amount, email, or mutable Ticket data.

Forward migration [`003_rename_inbox_messages.sql`](../../tickets/migrations/003_rename_inbox_messages.sql) preserves every processed-event row while renaming historical `inbox_messages` to `processed_order_events` and recreating the processed and aggregate-diagnostics indexes with their new names.

Poison entries are moved to the dead-letter stream and do not enter this processed-event ledger because a malformed envelope may not contain valid ledger metadata.

### Tickets transaction helper

One repository helper, [`applyOrderEventOnce`](../../tickets/src/tickets/ticket-repo.ts), consumes each supported Order fact under a single Tickets database transaction:

1. begin a write transaction;
2. check the stable `(consumer, message_id)` marker and return duplicate when present;
3. read current Ticket state and compute the diagnostic outcome;
4. apply the exact guarded state change when permitted;
5. insert the processed-event ledger marker with event metadata and final outcome;
6. commit;
7. acknowledge the stream entry only after commit.

For completion, the only mutation is reserved-to-sold with matching `locked_by_order_id`; it retains that Order identity and clears `lock_expires_at`. For expiration, the only mutation is matching reserved-to-available and clears both lock fields. If the guarded write no longer matches the state read, the helper rolls back and retries the whole local transaction rather than committing an incorrect processed-event ledger outcome.

The helper exposes no unguarded status update and no caller-controlled outcome.

## Purchase-start consistency

### Ordered local and cross-service work

1. Orders commits a new `purchase_operations` row in `reserving` with stable Order identity, authenticated user, idempotency key/fingerprint, Ticket identity, fixed 15-minute deadline, and due retry time.
2. Orders synchronously submits the exact idempotent reservation command to Tickets.
3. A definitive Tickets rejection commits the operation as `rejected` with its stable rejection code and no retry due.
4. A matching reservation response lets Orders commit one transaction that inserts the pending Order with accepted amount/currency/snapshot and marks the operation `completed`.
5. An unknown reservation result leaves the operation `reserving`; the worker repeats the exact reservation command.
6. At or after the fixed deadline, a conditional Orders update changes an incomplete `reserving` operation to `releasing`. Foreground completion is then forbidden.
7. The worker repeats the guarded purchase-recovery release until Tickets returns one definitive outcome, then commits the operation as `rejected` and clears retry scheduling.

The pending Order insert requires the operation to still be `reserving`, use the same Order/Ticket/deadline, and not have crossed the deadline. The transition to `completed` occurs in that same transaction. Thus no payable Order can be read before both local Order data and the known matching reservation exist.

### Purchase crash windows

| Crash or loss window | Durable state | Recovery |
|---|---|---|
| Before operation commit | No operation | Same client key creates the one operation later. No reservation was requested. |
| After operation commit, before reservation request | `reserving` due work | Startup/interval worker submits the exact reservation command. |
| Tickets definitively rejects, before Orders records rejection | `reserving`; Tickets unchanged | Exact retry returns the same safe rejection; Orders commits `rejected`. |
| Tickets reserves, before Orders receives response | `reserving`; Ticket reserved | Exact retry returns reservation replay; Orders inserts pending Order and completes operation if before deadline. |
| Tickets reserves, after deadline wins before pending commit | `releasing`; Ticket may be reserved | Pending insert fails its operation-state/deadline guard; release worker removes only the matching reservation. |
| Pending Order and completed operation commit, before client response | Order pending; operation `completed` | Same POST/key reads and returns the existing Order without reserving again or extending deadline. |
| Release commits in Tickets, before Orders records result | operation `releasing`; Ticket safely released/nonmatching | Exact release retry returns another definitive safe outcome; Orders commits `rejected`. |
| Rejected operation commits, before client response | operation `rejected` | Same POST/key returns the stored final business rejection. |
| Service restarts at any nonterminal operation state | `reserving` or `releasing` with due time | Startup scan resumes exact work from durable state. |

Only `reserving -> completed`, `reserving -> releasing`, and `reserving|releasing -> rejected` are permitted. `completed` and `rejected` are terminal operation states.

## Payment consistency

### Ordered work

1. Orders first resolves payment idempotency by `(order_id, idempotency_key)`. Same fingerprint replays the existing attempt/outcome; a conflicting fingerprint is rejected. A different key while one attempt is processing returns that processing attempt without provider submission.
2. With no replay, Orders synchronously verifies the exact matching reservation with Tickets.
3. Orders commits one transaction that conditionally changes its owned pending, unexpired Order to `payment_processing`, increments Order version, and inserts one processing Payment Attempt with scenario and due reconciliation time.
4. Orders submits the captured amount/currency and stable provider idempotency identity in a separate local-provider transaction.
5. Immediate provider terminal state or later provider reconciliation is applied in one Orders result transaction:
   - success: Attempt becomes `succeeded`; Order becomes `complete`; Order version increments; one completion event publication ledger message is inserted;
   - decline before deadline: Attempt becomes `failed`; Order returns to `pending`; Order version increments; no event publication ledger message;
   - decline at/after deadline: Attempt becomes `failed`; Order becomes `expired`; Order version increments; one expiration event publication ledger message is inserted;
   - unresolved: Attempt and Order remain processing; reconciliation diagnostics and next due time update without a terminal fact.

The result transaction requires the Attempt and Order still be the expected processing pair. Provider response never writes Orders state directly. Exact terminal replay reads the existing Attempt and current Order without another provider call.

### Payment crash windows

| Crash or loss window | Durable state | Recovery |
|---|---|---|
| Before Order/Attempt transaction | Order pending; no Attempt | Same request may safely retry eligibility and creation. |
| After matching-reservation verification, before local transaction | Ticket still reserved; Order pending | Retry re-verifies; stale verification alone authorizes nothing. |
| After Order becomes processing and Attempt inserts, before provider submission | Order/Attempt processing with due reconciliation | Worker submits using the same provider idempotency identity. |
| Provider commits, before provider response reaches Orders | Provider record exists; Order/Attempt processing | Worker lookup returns the same provider record. No second provider payment is created. |
| Provider returns unresolved | Both local records remain processing | Due reconciliation repeats lookup; expiration does not change the processing Order. |
| Provider reaches planned terminal state before Orders observes it | Provider terminal; Order/Attempt processing | Reconciliation applies one guarded Orders result transaction. |
| Orders result transaction commits, before client response | Attempt/Order terminal or Order returned pending; terminal fact may be in the event publication ledger | Same payment key replays without provider resubmission. Publisher handles any terminal fact. |
| Decline returns Order pending, then deadline passes | Order pending and due | Expiration worker conditionally expires it and inserts expiration event publication ledger message. |
| Process restarts while Attempt processing | Due reconciliation index | Startup scan resumes provider lookup/submission using stable identity. |

A raw provider scenario is accepted only from the API whitelist. Amount and currency always come from the Order. Provider processing prevents expiration until the result becomes known.

## Expiration consistency

The expiration worker scans `orders_due_pending` on startup and at a bounded interval. For each due candidate, one Orders transaction conditionally changes `pending` to `expired` only when `expires_at <= now`, increments version, and inserts exactly one expiration event publication ledger message for that new version.

| Condition | Result |
|---|---|
| Pending before deadline | No change. |
| Pending at/after deadline | Expired plus event publication ledger fact in one commit. |
| Payment processing | No change; provider reconciliation owns the next decision. |
| Complete | No change. |
| Already expired | No change and no second terminal fact. |
| Crash before transaction commit | Neither expiration nor fact exists; rescan retries. |
| Crash after commit | Order is expired and event publication ledger fact is durable; publisher recovery continues. |

No in-memory timer is authoritative. Restart does not move `expires_at`, and a closed browser has no effect.

## Publication consistency

The Orders terminal state and corresponding event publication ledger row commit atomically. The publisher scans unpublished rows on startup and interval, appends to `orders.events`, and only then records publication success.

| Publisher window | Recovery |
|---|---|
| Crash before stream append | Event publication ledger row remains unpublished and is retried. |
| Append succeeds, crash before publication mark | Same message may append again with the same `messageId`. |
| Publication mark commits | Normal publication is complete. |
| Temporary append failure | Attempt diagnostics update and the same event publication ledger row is retried. |

This is at-least-once publication. It never creates a new message identity for retry and never treats stream order as business authority.

## Tickets consumption and convergence

Tickets reads `orders.events` through consumer group `tickets-order-convergence`. Running consumer names are unique instance identities; processed-event ledger identity remains stable across instances.

For a valid supported entry:

1. execute the Tickets processed-event ledger-plus-guarded-transition transaction helper;
2. acknowledge only after commit;
3. leave an uncommitted/unacknowledged entry pending after failure;
4. inspect the group pending entries and use `XAUTOCLAIM` so another instance recovers entries abandoned by a failed consumer. Exact idle threshold, scan interval, and claim count are operational configuration.

Consumer crash windows:

| Consumer window | Recovery |
|---|---|
| Crash before local transaction | No Ticket/processed-event ledger change and no acknowledgement; pending recovery reprocesses. |
| Crash during local transaction | Both guarded change and processed-event ledger marker roll back; pending recovery reprocesses. |
| Commit succeeds, crash before acknowledgement | Redelivery finds the processed-event ledger marker and makes no second Ticket change, then acknowledges. |
| Duplicate delivery to another instance | Stable consumer/message primary key returns duplicate; no Ticket change. |
| Late distinct terminal fact | Current Ticket state and exact `lockedByOrderId` choose safe mutation or diagnostic non-change. |
| Poison entry | No Ticket transaction; dead-letter handling completes before original acknowledgement as defined in `events.md`. |

### Why no reverse convergence event is required

For a valid completion or expiration fact, the consumer-group pending list remains durable delivery work until Tickets commits its authoritative guarded outcome. Acknowledgement after commit proves that one Tickets instance finished local handling. The processed-event ledger then provides durable duplicate suppression and diagnostic evidence of the exact aggregate version and outcome.

Temporary Tickets failure leaves the entry pending for retry. Duplicate and late delivery are safe. A valid matching reservation therefore converges without Orders consuming a reverse acknowledgement event and without adding a second cross-service audit protocol. Orders retains its terminal state and event publication ledger evidence; Tickets retains its processed-event ledger outcome. An impossible guarded non-match is acknowledged with a diagnostic outcome rather than mutating unsafe state, and is investigated from those two durable records.

## Worker scheduling and retry policy

Every worker scans durable due state on startup and at a configurable interval. Process-local timers may wake a scan but never establish eligibility or move a deadline.

| Worker | Due source | Retry rule |
|---|---|---|
| Purchase recovery | `purchase_operations_due_retry` | Retry exact reserve while `reserving`; at deadline conditionally move to `releasing`; retry exact guarded release until definitive. |
| Payment reconciliation | `payment_attempts_due_reconciliation` | Submit/lookup with stable provider idempotency; apply only verified terminal result. |
| Local provider resolution | `local_provider_payments_due_resolution` | At/after fixed `resolve_at`, apply planned terminal outcome once. |
| Pending expiration | `orders_due_pending` | Conditionally expire only currently pending due Orders. |
| Event publication ledger publisher | Unpublished event publication ledger index | Append the same envelope/message identity; persist attempt count, last error, and attempt time. Compute retry eligibility from those durable values. |
| Tickets pending recovery | Consumer-group pending inspection | Claim abandoned entries with `XAUTOCLAIM`; processed-event ledger and guards make repetition safe. |

Retry scheduling uses bounded exponential backoff with jitter for dependency/transport failures. Purchase and payment recovery persist explicit next-due timestamps; event publication ledger publication derives its next eligibility from persisted `updated_at` and `attempt_count`; all retain concise last-error diagnostics. Business rejections and definitive guarded release outcomes are not retried. Deadline eligibility always uses current backend time and durable deadline, never the scheduled wake time.

Exact base delay, cap, jitter range, scan interval, claim idle threshold, and batch size remain operational configuration because they do not change the business result.

## Retention and growth ceiling

For the local learning implementation:

- `orders.events` has no automatic trimming.
- Published Orders event publication ledger rows are retained.
- Tickets processed-event ledger rows are retained for the full replayable stream history.
- Dead letters are retained for diagnosis.
- Purchase operations, Orders, Payment Attempts, and local provider payments are retained as business/recovery history.

This deliberately favors complete replay and diagnosis over cleanup at small volume. The ceiling is unbounded database and stream growth.

A later measured policy must choose one replay horizon longer than the maximum supported consumer outage, retain event publication ledger and processed-event ledger evidence for at least that horizon, and archive or rebuild older convergence evidence before coordinated stream trimming or ledger cleanup. Processed-event ledger evidence must never expire before a still-replayable message with the same identity.

## Required source changes

### Orders migrations and repositories

- Add `purchase_operations` with its immutable command data, state/rejection checks, retry diagnostics, unique user/key constraint, and due index.
- Rebuild `orders` with immutable Ticket snapshot fields and due-pending index; remove Order idempotency columns.
- Rebuild `payment_attempts` with provider scenario, reconciliation diagnostics, consistency checks, and due index.
- During cutover, convert legacy `pending`/`payment_processing` Orders to `expired` and legacy processing Payment Attempts to `failed`; those rows predate Tickets reservations and local-provider recovery state, so they must not remain payable or retryable.
- Apply forward migration [`010_rename_outbox_messages.sql`](../../orders/migrations/010_rename_outbox_messages.sql) to rename `outbox_messages` to `order_event_publications` and recreate its due index. Retain historical migrations `004_create_inbox_messages.sql` and `008_drop_inbox_messages.sql` unchanged because the migration ledger verifies applied files and checksums.
- Retain and use the Orders event publication ledger repository in terminal Order transactions.
- Replace the current caller-authored Order insert with purchase-operation and guarded Order lifecycle repositories.
- Add restricted transaction helpers for pending Order creation, payment start/result, and pending expiration.

### Orders workers/capabilities

- Add purchase recovery, pending expiration, payment reconciliation, local-provider resolution, and event publication ledger workers driven by durable due scans.
- Ensure every worker scans on startup and interval and persists retry diagnostics.
- Keep provider state behind its separate transaction boundary.

### Tickets migrations and repositories

- Rebuild the Ticket state/lock constraint and add the unique non-null Order-lock index.
- Rename the historical Tickets event marker table to the processed-event ledger with forward migration [`003_rename_inbox_messages.sql`](../../tickets/migrations/003_rename_inbox_messages.sql), preserving rows and recreating its indexes with the new names.
- Add exact idempotent reserve, matching-reservation read, and guarded purchase-recovery release repositories.
- Add one processed-event ledger-plus-guarded sold/release transaction helper for committed Order facts, exposed as `applyOrderEventOnce`.

### Tickets worker/capability

- Add the Tickets convergence consumer for the accepted stream/group.
- Acknowledge only after the local transaction commits.
- Recover abandoned pending entries with `XAUTOCLAIM` and stable processed-event ledger identity.

## Explicit consistency boundaries

- No shared database and no cross-service foreign key.
- No caller-controlled identity, amount, currency, Order identity, state, deadline, or snapshot.
- No payable Order before matching reservation plus pending Order commit.
- No Order expiration while payment is processing.
- No Ticket sold/release without exact `lockedByOrderId`.
- No reverse event for convergence.
- No Orders event consumer or dormant processed-event ledger.
- No browser-authoritative timer or worker eligibility.
- No raw card data.
- No implementation sequence and no sequence-diagram syntax in this document.
