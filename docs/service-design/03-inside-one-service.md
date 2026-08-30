# 3. Inside One Service

## Goal

Recognize the usual parts of a service and the responsibility of each part.

![Cutaway showing the usual parts of one backend service](assets/service-anatomy.png)

## The six parts

| Number | Part | Responsibility |
|---|---|---|
| 1 | Inbound interface | Receive HTTP requests, messages, or scheduled triggers |
| 2 | Application use case | Coordinate one business operation |
| 3 | Domain rules and owned state | Decide valid transitions and persist authoritative records |
| 4 | Outbound interface | Call another owner or publish committed information |
| 5 | Background worker | Resume durable work that must outlive one request |
| 6 | Operations surface | Configuration, health, logs, metrics, startup, and shutdown |

A real service also validates data at every trust boundary. Authentication tells
it who is calling. Authorization rules owned by this service decide whether that
caller may perform this action.

## Normal request flow

```text
Inbound interface
  -> application use case
  -> domain rule
  -> owned database transaction
  -> optional outbound work
  -> returned outcome
```

Keep the responsibilities separate even when the implementation is small:

- The HTTP route maps transport input and output.
- The use case coordinates the operation.
- The domain or repository protects authoritative state transitions.
- The database constraint is the final guard against races.
- A worker resumes work that cannot be safely tied to one request.

This does **not** require six frameworks or six layers of interfaces. One small
file may hold several cohesive pieces. The separation is conceptual first.

## Components are conditional

Not every service needs every mechanism.

| Need | Add |
|---|---|
| Public or internal request | HTTP or RPC interface |
| Durable owned state | Database and migrations |
| Must resume after restart | Durable work record and worker |
| Must publish after commit | Publication ledger and publisher |
| Must consume messages | Consumer, processed-message record, acknowledgement |
| Must be operated | Health, logs, metrics, configuration, graceful shutdown |

Do not add a broker consumer, cache, worker, or projection “for later.” Add it
when a named business flow requires it.

## Failure ownership

The service that owns a durable record also owns recovering unfinished work for
that record.

Examples:

- Orders owns a pending Order, so Orders decides expiration and resumes its work.
- Tickets owns Ticket reservations, so Tickets performs guarded reservation,
  release, and sold transitions.
- Redis transports facts. It does not become the owner of either entity.

## Checkpoint

Take one existing service and map its current files or functions to parts 1–6.
Write `not needed` for any absent part rather than inventing one.

## Exit gate

Continue only when you can trace one request from input to authoritative state
and name which component recovers if the process dies halfway through.