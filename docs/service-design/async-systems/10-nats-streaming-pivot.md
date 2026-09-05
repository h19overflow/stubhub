# 10. The NATS Streaming Messaging Pivot & Deep Module Segmentation

[Companion index](./index.md) · [Strongly-Typed Event Pipeline (09)](./09-strongly-typed-event-pipeline.md) · [Durable Subscriptions (08)](./08-durable-subscriptions.md)

---

## 1. Executive Summary

This document records the system-wide architecture pivot: **replacing the initial Redis Streams event transport with an end-to-end, strongly-typed NATS Streaming (STAN) event pipeline established in `@stubhub/common`, combined with segmented Deep Module boundaries in both `Orders` and `Tickets` services.**

```mermaid
flowchart LR
    subgraph Orders Service
        O_Tx["1. SQLite ACID Transaction<br/>(Order State + Outbox Row)"]
        O_Repo["outbox-repo.ts"]
        O_Disp["outbox-dispatcher.ts"]
        O_Pub["OrderCompletedPublisher<br/>OrderExpiredPublisher"]
        O_Tx --> O_Repo --> O_Disp --> O_Pub
    end

    subgraph NATS Streaming (Cluster: ticketing)
        N_Completed["Subject: order:completed<br/>(Durable Queue: tickets-order-convergence)"]
        N_Expired["Subject: order:expired<br/>(Durable Queue: tickets-order-convergence)"]
    end

    subgraph Tickets Service
        T_Sub["order-events-consumer.ts"]
        T_LCompleted["OrderCompletedListener"]
        T_LExpired["OrderExpiredListener"]
        T_Repo["applyOrderEventOnce()<br/>(Guarded Ticket Transition)"]
        T_Ack["msg.ack()<br/>(Committed Acknowledgment)"]

        T_Sub --> T_LCompleted & T_LExpired
        T_LCompleted & T_LExpired --> T_Repo --> T_Ack
    end

    O_Pub -->|Publish JSON| N_Completed & N_Expired
    N_Completed -.->|Deliver Message| T_LCompleted
    N_Expired -.->|Deliver Message| T_LExpired
```

---

## 2. Motivation: Why Pivot from Raw Streams to Typed NATS Contracts?

In early prototypes, cross-service messaging relied directly on broker-specific primitives (`xAdd`, `xReadGroup`, `xAutoClaim`). While functionally durable, this approach introduced two persistent maintainability hazards:

1. **Untyped Channel Hazards & Silent Drops:**
   - Raw string keys (e.g. `"orders.events"`) and unvalidated event type strings allowed channel typos that brokers never rejected. A typo resulted in zero messages received with zero application errors.
   - Consumers guessed payload property names, risking `undefined` evaluation and corrupted database writes.
2. **Monolithic Transport Leakage:**
   - Transport mechanics (connections, client options, stream offsets, ack timeouts) were entangled directly with business domain controllers and route handlers.

### The Solution: The Bounded Generics Pattern

The pivot establishes a central contract layer in `@stubhub/common` using TypeScript's indexed access types and bounded generics:

```ts
export interface Event {
  subject: Subjects;
  data: unknown;
}

export abstract class Publisher<T extends Event> {
  abstract subject: T["subject"];
  // ... promisified async publish(data: T["data"])
}

export abstract class Listener<T extends Event> {
  abstract subject: T["subject"];
  abstract queueGroupName: string;
  abstract onMessage(data: T["data"], msg: Message): void | Promise<void>;
  // ... transport mechanics, manual ack, durable subscription
}
```

Every domain event pairs an exact literal variant of `Subjects` with a typed payload. Neither publishers nor listeners can compile if channel names or payload fields disagree.

---

## 3. Structural Decomposition: Deep Module Segmentation

To adhere to the principle of **Deep Modules** (simple surface, substantial mechanics hidden inside), both services have segmented their messaging infrastructure into single-responsibility submodules:

### A. Shared Event Foundation (`@stubhub/common`)

```text
common/src/events/
├── types/
│   ├── subjects.ts              # Single source of truth for channel names (Subjects enum)
│   ├── order-status.ts          # Shared OrderStatus lifecycle enumeration
│   ├── ticket-created-event.ts  # TicketCreatedEvent contract
│   ├── ticket-updated-event.ts  # TicketUpdatedEvent contract
│   ├── order-created-event.ts   # OrderCreatedEvent contract
│   ├── order-cancelled-event.ts # OrderCancelledEvent contract
│   ├── order-completed-event.ts # OrderCompletedEvent contract
│   ├── order-expired-event.ts   # OrderExpiredEvent contract
│   └── index.ts                 # Re-exports all event types
├── base-listener.ts             # Abstract Listener<T extends Event>
├── base-publisher.ts            # Abstract Publisher<T extends Event>
└── index.ts                     # Main event infrastructure barrel
```

### B. Orders Messaging Subsystem (`orders/src/messaging`)

Orders retains the **Transactional Outbox Pattern** to prevent dual-write loss, but isolates every lifecycle responsibility:

```text
orders/src/messaging/
├── types.ts                     # Publication rows, ledger records, payload contracts
├── nats-client.ts               # Lazy singleton NATS connection & graceful close
├── publishers/
│   ├── order-completed-publisher.ts # Extends Publisher<OrderCompletedEvent>
│   ├── order-expired-publisher.ts   # Extends Publisher<OrderExpiredEvent>
│   └── index.ts
├── outbox-repo.ts               # SQLite staging, retry backoff calculation, queries
├── outbox-dispatcher.ts         # Outbox polling worker & NATS emission
└── index.ts                     # Unified facade (enqueueOrderFact, dispatchDueOrderEvents)
```

- **Domain Controllers** only call `enqueueOrderFact(...)` inside their existing SQLite ACID transactions (`STAGE 1`).
- **Background Dispatcher** polls unpublished rows and publishes via `OrderCompletedPublisher` or `OrderExpiredPublisher` (`STAGE 2`).
- Network failures trigger exponential backoff without losing committed business state.

### C. Tickets Convergence Consumer (`tickets/src/orders`)

Tickets consumes terminal Order facts to converge local Ticket status (`reserved -> sold` or `reserved -> available`):

```text
tickets/src/orders/
├── listeners/
│   ├── order-completed-listener.ts # Converges matching reservation to sold
│   ├── order-expired-listener.ts   # Releases matching reservation to available
│   └── index.ts
└── order-events-consumer.ts        # Client connection, listener startup, and shutdown
```

- **Execution Flow:** Incoming message $\rightarrow$ deserialization $\rightarrow$ `applyOrderEventOnce()` in SQLite transaction $\rightarrow$ `msg.ack()`.
- **Invariant:** Acknowledgment occurs **only after** the local database transaction commits. A crash during processing leaves the message unacknowledged; NATS redelivers it after `ackWait` (5 seconds).

---

## 4. Architectural Comparison: Redis Streams vs. NATS Streaming

| Dimension | Previous Implementation (Redis Streams) | New Implementation (NATS Streaming) |
| :--- | :--- | :--- |
| **Broker Technology** | Redis 7 Streams | NATS Streaming (STAN, Cluster ID: `ticketing`) |
| **Channel Routing** | Stream key (`orders.events`) + internal JSON `eventType` | Native subjects (`order:completed`, `order:expired`) |
| **Contract Enforcement** | Runtime Zod schema parsing | Compile-time generic pairing (`T["subject"]` $\leftrightarrow$ `T["data"]`) |
| **Publishing API** | Raw `client.xAdd(stream, "*", fields)` | Promisified `await publisher.publish(data)` |
| **Consumer Load Balancing** | Redis Consumer Group (`XREADGROUP`) | NATS Queue Group (`queueGroupName: "tickets-order-convergence"`) |
| **Durable Offsets** | Consumer group offset tracking | NATS Durable Subscription (`is_durable: true`) |
| **Redelivery on Crash** | Manual `XAUTOCLAIM` scanning Pending Entries List (PEL) | Broker-managed redelivery upon unacknowledged `ackWait` timeout |
| **Publishing Safety** | Transactional Outbox in SQLite | Transactional Outbox in SQLite + Typed NATS Dispatcher |

---

## 5. Live Runtime Verification in Kubernetes

The entire pipeline was verified running inside local Kubernetes (`stubhub` namespace):

1. **Deployments Verified Running:**
   - `nats-depl` (NATS Streaming server on port 4222 / 8222)
   - `tickets` deployment (listening on port 3002 with active durable queue subscriptions)
   - `orders` deployment (listening on port 3003)
2. **Subscription State from NATS Monitoring Endpoint (`:8222/streaming/channelsz?subs=1`):**
   - Channels: `order:completed` and `order:expired`
   - Active Subscriber: `client_id: "tickets-consumer-a671044c"`
   - Queue Name: `tickets-order-convergence`
   - Flags: `is_durable: true`, `is_offline: false`, `ack_wait: 5`
3. **End-to-End Delivery & Acknowledgment Proof:**
   - Emitted `order:completed` event $\rightarrow$ GUID `9VHIWELSXKPTB6FOCK2299` returned.
   - Tickets logged: `Message received: order:completed / tickets-order-convergence`.
   - NATS channel stats confirmed `msgs: 1`, `last_sent: 1`, `pending_count: 0` (instant manual ACK).
   - Emitted `order:expired` event $\rightarrow$ GUID `J1DQSIYGX1JHVWPTTWZIA7` returned.
   - Tickets logged: `Message received: order:expired / tickets-order-convergence`.
   - NATS channel stats confirmed `msgs: 1`, `last_sent: 1`, `pending_count: 0`.
