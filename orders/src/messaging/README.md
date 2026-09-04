# Orders Messaging (Transactional Outbox)

The Orders service produces durable business facts (`order.completed`, `order.expired`) using the **Transactional Outbox** pattern.

> 📖 **Full System Guide**: See [`docs/messaging-architecture.md`](file:///c:/Users/User/publicprojects/MicroServices/stubhub/docs/messaging-architecture.md) for the end-to-end lifecycle between Orders and Tickets.

---

## How It Works in Orders

1. **Deep Module Boundary (`index.ts`)**
   - Callers express domain intent (`enqueueOrderFact`, `dispatchDueOrderEvents`, `closeOrderMessaging`).
   - Hides transport connection state, JSON serialization, envelope formatting, stream key names, and retry schedules.

2. **[STAGE 1: STAGE] `order-event-publication-repo.ts`**
   - When an order transitions to `complete` or `expired` (in `order-repo.ts` or `payment-attempt-repo.ts`), an event publication is inserted into `order_event_publications` **in the exact same database transaction**.
   - Ensures zero lost events even during abrupt server crashes.

3. **[STAGE 2: DISPATCH] `outbox-dispatcher.ts`**
   - Called by the background worker loop via `dispatchDueOrderEvents()`.
   - Polls due rows (`published_at IS NULL AND next_attempt_at <= now`).
   - Appends entries to Redis Stream `orders.events` using `XADD`.
   - On success, sets `published_at = now`.
   - On failure, increments `attempt_count` and applies exponential backoff in `next_attempt_at`.
4. **Transport Separation**
   - Redis is transport only; Orders' local SQLite database remains authoritative.

```mermaid
sequenceDiagram
    autonumber
    participant App as Order/Payment Logic
    participant Repo as order-event-publication-repo.ts
    participant DB as Orders SQLite DB
    participant Worker as outbox-dispatcher.ts
    participant Redis as Redis Stream (orders.events)

    Note over App,DB: STAGE 1: STAGE (Transactional Outbox)
    App->>DB: BEGIN TRANSACTION
    App->>DB: UPDATE orders SET status='complete'/'expired' ...
    App->>Repo: enqueueOrderEventPublication(fact)
    Repo->>DB: INSERT INTO order_event_publications (published_at=NULL)
    App->>DB: COMMIT

    Note over Worker,Redis: STAGE 2: DISPATCH (Background Worker)
    Worker->>Repo: listDueOrderEventPublications(now)
    Repo->>DB: SELECT * FROM order_event_publications WHERE published_at IS NULL
    DB-->>Worker: [publication]
    Worker->>Redis: xAdd('orders.events', '*', envelope)
    alt Success
        Worker->>Repo: markOrderEventPublished(id)
        Repo->>DB: UPDATE order_event_publications SET published_at=now
    else Failure
        Worker->>Repo: recordOrderEventPublicationFailure(id, err)
        Repo->>DB: UPDATE SET next_attempt_at=now + backoff, attempt_count+1
    end
```

---

## File Map

- [index.ts](file:///c:/Users/User/publicprojects/MicroServices/stubhub/orders/src/messaging/index.ts): Deep module facade (`enqueueOrderFact`, `dispatchDueOrderEvents`, `closeOrderMessaging`).
- [order-event-publication.ts](file:///c:/Users/User/publicprojects/MicroServices/stubhub/orders/src/messaging/order-event-publication.ts): TypeScript types and row mappers for publication records.
- [order-event-publication-repo.ts](file:///c:/Users/User/publicprojects/MicroServices/stubhub/orders/src/messaging/order-event-publication-repo.ts): Database repository (`enqueueOrderEventPublication`, `listDueOrderEventPublications`, `markOrderEventPublished`, `recordOrderEventPublicationFailure`).
- [outbox-dispatcher.ts](file:///c:/Users/User/publicprojects/MicroServices/stubhub/orders/src/messaging/outbox-dispatcher.ts): Dispatch runner handling batch polling, Redis transport, and retry management.
