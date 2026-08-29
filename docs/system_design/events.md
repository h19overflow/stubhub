# Commerce Events — Step 6

**Status:** Proposed design for review. This is not yet an accepted contract.

## Purpose

The commerce slice has exactly two cross-service committed facts:

- `order.completed` version 1
- `order.expired` version 1

Orders publishes them only after its local state change commits. Tickets consumes them to converge its separately owned Ticket state. Reservation winning, listing changes, payment attempts, and provider outcomes are not events: they are immediate decisions or Orders-internal work with no accepted external consumer.

## Shared envelope

Each stream entry contains one field named `event`. Its value is one JSON object with this envelope:

```json
{
  "messageId": "stable unique message identity",
  "eventType": "order.completed",
  "eventVersion": 1,
  "aggregateType": "order",
  "aggregateId": "order identity",
  "aggregateVersion": 3,
  "occurredAt": "ISO-8601 timestamp",
  "payload": {
    "ticketId": "ticket identity"
  }
}
```

| Field | Contract |
|---|---|
| `messageId` | Stable identity for this committed fact. Publisher retry reuses it; consumers use it for duplicate detection. |
| `eventType` | Exactly `order.completed` or `order.expired`. |
| `eventVersion` | Positive contract version. Both contracts in this document are version `1`. |
| `aggregateType` | Exactly `order`. |
| `aggregateId` | The Order identity; equivalent to `orderId`. It is the ordering key. |
| `aggregateVersion` | The Order version after the terminal transition. It supports diagnosis and future consumers but does not authorize Ticket mutation. |
| `occurredAt` | Time at which Orders committed the terminal transition, represented as an ISO-8601 timestamp. It is informational, not an authorization clock. |
| `payload` | Versioned fact-specific data. Version 1 contains only `ticketId`. |

The envelope deliberately contains no `userId`, amount, email address, provider data, or mutable Ticket data. Tickets already owns the Ticket record and needs only the Order identity from `aggregateId`, the terminal fact type, and `ticketId` to select and guard convergence.

## `order.completed` version 1

### Meaning

Orders has committed the terminal transition to `complete` after a verified successful payment outcome. The Order cannot later expire or become payable again.

### Producer

Orders outbox publisher.

### Consumer

Tickets convergence capability.

### Minimum payload

```json
{
  "ticketId": "ticket identity"
}
```

### Consumer effect

Tickets selects `payload.ticketId` and attempts `reserved` -> `sold` only when the Ticket's current `lockedByOrderId` exactly equals `aggregateId`.

- Matching reservation: mark the Ticket sold.
- Already-applied duplicate: no additional change.
- Reserved by another Order: no change.
- Available: no change.
- Missing Ticket: no change to Ticket state; retain diagnostic evidence for investigation.

The current Ticket state and matching-order guard authorize the transition. Stream position, `occurredAt`, and `aggregateVersion` do not.

## `order.expired` version 1

### Meaning

Orders has committed the terminal transition to `expired`. This includes a pending Order whose deadline passed before payment submission and a processing Order whose on-time payment later failed after the deadline. The Order cannot later complete or become payable again.

### Producer

Orders outbox publisher.

### Consumer

Tickets convergence capability.

### Minimum payload

```json
{
  "ticketId": "ticket identity"
}
```

### Consumer effect

Tickets selects `payload.ticketId` and attempts `reserved` -> `available` only when the Ticket's current `lockedByOrderId` exactly equals `aggregateId`.

- Matching reservation: release it and make the Ticket available.
- Already-applied duplicate: no additional change.
- Reserved by another Order: no change.
- Sold: no change.
- Already available: no change.
- Missing Ticket: no change to Ticket state; retain diagnostic evidence for investigation.

The matching-order guard prevents a delayed expiration from unlocking a newer reservation.

## Topology

| Item | Decision |
|---|---|
| Stream | `orders.events` |
| Entry shape | One JSON envelope in field `event` |
| Consumer group | `tickets-order-convergence` |
| Consumer names | Unique running-instance identities; they are delivery identities, not idempotency identities. |
| Ordering key | `aggregateId` / Order identity |
| Delivery | At least once |
| Retention for local learning | No automatic trimming |
| Dead letter stream | `orders.events.dead-letter` |

The durable inbox consumer identity is the stable Tickets convergence capability/group, not a running-instance name. This lets a redelivery handled by another instance still find the original `messageId` marker.

`aggregateId` is the entity-ordering key for diagnosis and any future routing strategy. The current stream's observed order is not authority. Ticket state plus exact `lockedByOrderId` remains the authorization rule even if distinct facts are delayed or observed out of order.

## Publication rule and crash windows

Orders records the terminal Order transition and its outbox message atomically in the same local commit. The outbox publisher later appends the envelope to `orders.events` and records publication progress.

| Crash window | Required recovery |
|---|---|
| Before the local commit | Neither terminal state nor publishable fact exists. No publication occurs. |
| After local commit, before stream append | The outbox message remains unpublished and is retried. |
| After stream append, before publication progress is recorded | The same envelope may be appended again with the same `messageId`. This is expected at-least-once delivery. |
| After publication progress is recorded | Normal publication is complete. A previously duplicated append remains safe. |

The publisher must never mint a new `messageId` for retry of the same outbox message. Publication order cannot authorize a business transition.

## Consumption, acknowledgement, and crash windows

For each supported envelope, Tickets begins one local database transaction, records the inbox marker for the stable convergence consumer and `messageId`, and applies the guarded Ticket transition in that same transaction. Tickets acknowledges the stream entry only after that transaction commits.

| Condition or crash window | Required behavior |
|---|---|
| Inbox marker already exists for `messageId` | Make no Ticket change and acknowledge the duplicate. |
| Crash before the Tickets transaction commits | Neither inbox marker nor Ticket transition is committed; do not acknowledge. The pending entry is recoverable. |
| Crash after transaction commit, before acknowledgement | Redelivery finds the inbox marker, makes no additional change, and acknowledges. |
| Guard produces no Ticket change | Commit the inbox marker with the guarded non-change, retain diagnostics when the state is unexpected, then acknowledge. Repetition must not spin forever. |
| Consumer instance disappears with pending entries | Inspect the consumer group's pending entries and claim recoverable work with another instance. Exact idle thresholds, scan frequency, and claim limits belong to operational configuration. |

Inbox retention must cover the stream's replayable history. With no automatic stream trimming in the local learning setup, inbox cleanup is not selected yet.

## Duplicate, late, and out-of-order behavior

### Same `messageId`

A duplicate is a no-op after the first committed inbox marker and guarded transition. This remains true when another running instance receives the duplicate.

### Distinct late facts

Orders permits only one terminal Order state, so correct production cannot create both completion and expiration facts for the same Order. Consumers still do not rely on that assumption alone:

- a late expiration cannot release a Ticket whose current `lockedByOrderId` differs;
- a late completion cannot sell a Ticket whose current `lockedByOrderId` differs;
- sold never returns to available;
- already available is not changed by a stale fact.

An impossible pair of distinct terminal facts is logged for diagnosis. Ticket guards, not arrival order, determine the safe non-change.

### Aggregate version

`aggregateVersion` helps identify stale, duplicated, missing, or impossible observations and gives future consumers an entity version. Tickets does not compare it as authorization for sold or release because Ticket and Order versions belong to different owners. The current Ticket state and exact `lockedByOrderId` are the business guard.

## Malformed, unknown, and unsupported input

Before mutation, Tickets validates the envelope, supported type, version, aggregate type, identifiers, timestamp form, and required `ticketId` payload.

For malformed JSON, malformed envelope, unknown type, or unsupported version:

1. record and log the entry as poison with a concise reason;
2. do not mutate Ticket state;
3. append the original entry to `orders.events.dead-letter`;
4. acknowledge the original only after the dead-letter append succeeds.

A crash after dead-letter append but before original acknowledgement may create a duplicate dead-letter entry. Duplicate dead letters are acceptable. Poison handling must not block later valid entries indefinitely.

Dead-letter contents are diagnostic copies, not business facts and not an alternate authorization path. Their operational review and replay procedure is not defined here.

## Schema evolution

- `eventType` identifies the fact; `eventVersion` identifies its contract.
- Version 1 requires the envelope fields above and exactly the semantic minimum `ticketId` payload.
- Consumers may ignore additional unknown fields that do not change version 1 meaning.
- A semantic or breaking change requires a new positive event version and explicit consumer support before production.
- Unsupported versions follow poison handling; consumers never guess their meaning.
- An event version is independent of `aggregateVersion`.
- New event types require a concrete external consumer and behavior that cannot be served by the two existing facts.

## Privacy and logging

These facts carry only Order identity, Ticket identity, versions, type, occurrence time, and message identity. They exclude buyer identity, email, amount, provider references, payment material, and mutable Ticket presentation data.

Normal logs use message, aggregate, type, and version metadata plus concise failure reasons. Logs must not enrich the event with user or payment data from other records. Dead-letter access should be limited as operational diagnostic access even though the version 1 payload is minimal.

## Replay behavior

With no automatic trimming, a new Tickets convergence group can replay `orders.events` from the beginning. An existing group first recovers its pending entries, then continues with unseen entries.

Replay is safe because:

- the same `messageId` is suppressed by the inbox marker;
- a new stable consumer identity may observe old facts, but guarded Ticket transitions remain idempotent;
- sold and release require current state plus exact `lockedByOrderId`;
- replay never changes an Order;
- poison entries follow the same dead-letter rule.

Replay can repair missed convergence only while the event remains available and the Ticket still satisfies the matching guard. It is not a substitute for backups or for resolving impossible state manually.

## Retention ceiling

No automatic trimming is the smallest reliable local-learning choice because it preserves full replay while event volume is small. Its known ceiling is unbounded stream and matching inbox growth.

Upgrade when measured event rate, storage growth, or required recovery time makes that ceiling material. The later policy must measure the longest required replay horizon and maximum supported consumer outage, retain data beyond that horizon, and define how older convergence evidence is archived or rebuilt before bounded trimming is enabled.

## Explicit non-events

No event is added for:

- Ticket discovery or detail reads;
- listing creation or price editing;
- purchase request or reservation winning;
- reservation accepted price;
- purchase retry lookup;
- payment eligibility or matching-reservation verification;
- Payment Attempt creation, success, or failure;
- provider accepted, declined, or unresolved results;
- browser countdown changes;
- My Orders or Order-detail reads.

These interactions are immediate decisions, read-only observations, local presentation, or Orders-internal durable work. None has an accepted external consumer requiring another committed fact.

## Deferred to later design

- Public and internal operation contracts.
- Persistence schemas beyond the required atomic outbox/inbox rules above.
- Operational timing, capacity, alerting, and dead-letter review procedures.
- Sequence diagrams.
