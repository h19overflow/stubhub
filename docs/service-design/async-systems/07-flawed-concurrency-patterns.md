# Flawed Concurrency Patterns: Why Common "Naive" Solutions Fail

When developers first encounter asynchronous event concurrency and race conditions, they almost always attempt one of three intuitive patterns. This document breaks down each pattern, provides Mermaid sequence and architecture diagrams, and explains the fatal technical flaws that prevent them from working in production.

---

## Pattern 1: Global Sequence Number in Shared State

### The Concept
All worker instances share a central fast data store (Redis, shared cache, or central DB). 
- Every event emitted by NATS carries an auto-incrementing broker sequence number (`#1`, `#2`, `#3`, etc.).
- When a worker picks up event `#N`, it consults the shared store to verify that event `#(N - 1)` has already completed.
- If `#(N - 1)` is present in the store, the worker processes `#N` and records `#N` into the store. If not, it rejects or stalls `#N`.

### Visual Sequence

```mermaid
sequenceDiagram
    autonumber
    actor P as Publisher
    participant Broker as Event Broker
    participant Shared as Central State (Processed Seq #)
    participant W_A as Worker A
    participant W_B as Worker B
    participant DB as User Accounts

    Note over Shared: Processed Seq: [ ]

    P->>Broker: 1. Deposit Jim $70 (Seq #1)
    P->>Broker: 2. Deposit Mary $40 (Seq #2)

    Broker->>W_A: Assign: Seq #1 (Jim)
    Broker->>W_B: Assign: Seq #2 (Mary)

    Note over W_A: Worker A encounters I/O lag or file lock...<br/>Seq #1 is NOT yet processed!

    W_B->>Shared: Has Seq #1 been processed? (2 - 1 = 1)
    Shared-->>W_B: NO! (Seq #1 missing)
    
    Note over W_B: ⛔ Worker B must FREEZE or reject Seq #2!<br/>Mary's account is locked waiting for Jim!
```

### Why It Fails (The Fatal Flaw)
1. **Global Head-of-Line Blocking**:
   - Every entity in the entire system becomes tightly coupled to a single global bottleneck.
   - If User Jim’s event encounters a transient failure or a 30-second `ackWait` timeout, **User Mary, User Bob, and every other unrelated user in the system are completely blocked from executing!**
2. **Destroys Microservice Throughput**:
   - It degrades the horizontal scalability of your worker pool into a strictly single-threaded, sequential pipeline.
3. **Shared-State Contention & Distributed Locking**:
   - High concurrent read/write churn on a single global sequence store creates severe lock contention, turning the shared store into a single point of failure (SPOF).

---

## Pattern 2: Channel-Per-Resource (User-Specific Channels)

### The Concept
To prevent User Jim from blocking User Mary, we give every entity (or user) its own isolated sequence stream:
- Jim gets his own dedicated channels: `account-deposit-jim`, `account-withdraw-jim`.
- Mary gets her own dedicated channels: `account-deposit-mary`, `account-withdraw-mary`.
- Inside Jim's channel, sequence numbers reset (`#1`, `#2`, `#3`), so Jim's failures only stall Jim, while Mary processes independently.

### Visual Architecture

```mermaid
flowchart TD
    P[Publisher]

    subgraph Broker ["Message Broker (NATS / Kafka)"]
        subgraph JimChannels ["Jim's Dedicated Channels"]
            J1["deposit:jim (Seq #1, #2...)"]
            J2["withdraw:jim (Seq #1, #2...)"]
        end
        subgraph MaryChannels ["Mary's Dedicated Channels"]
            M1["deposit:mary (Seq #1, #2...)"]
            M2["withdraw:mary (Seq #1, #2...)"]
        end
        subgraph Unknown ["1,000,000+ More Channels..."]
            U1["deposit:user_999999"]
        end
    end

    subgraph Workers ["Worker Pool"]
        WA[Worker Instance A]
        WB[Worker Instance B]
    end

    P --> J1
    P --> J2
    P --> M1
    P --> M2
    JimChannels --> Workers
    MaryChannels --> Workers
```

### Why It Fails (The Fatal Flaw)
1. **Broker Channel Limits & Memory Exhaustion**:
   - NATS Streaming, Kafka, and RabbitMQ have practical limits on active channels/topics/partitions (e.g., NATS Streaming default channel limit is **1,000 channels**).
   - In an e-commerce or marketplace system with millions of users, orders, or tickets, creating dynamic channels per resource quickly causes broker memory exhaustion, slow leader-elections, and cluster crashes.
2. **Subscription Management Nightmare**:
   - Workers cannot statically subscribe to known topics; they must dynamically discover, open, maintain, and heartbeat thousands of individual channel subscriptions.
3. **High Protocol Overhead**:
   - Broker internal bookkeeping (tracking consumer offsets, file descriptors, in-memory state machines per channel) scales with channel count, degrading broker performance exponentially.

---

## Pattern 3: Publisher Event Store with "Previous Sequence Pointer"

### The Concept (Detailed Breakdown)
This pattern attempts to achieve resource-level ordering on a **single shared channel** by having the publisher act as an intelligent coordinator.

#### How It Is Supposed to Work:
1. The publisher maintains an internal database (`events_history`) recording every event it has ever emitted.
2. When the publisher sends an event to NATS, NATS assigns it a broker sequence number (e.g., `#1`).
3. The publisher receives this sequence number back and saves it: `Last sequence for Jim = #1`.
4. When the publisher later prepares a second event for Jim, it attaches a pointer:
   ```json
   {
     "resource": "jim",
     "action": "deposit",
     "amount": 40,
     "previousSeq": 1
   }
   ```
5. When this second event is dispatched, NATS gives it sequence `#3` (because sequence `#2` was used for Mary).
6. When Worker B receives `#3`, it checks its local/shared store:
   - *"Does the last processed event for Jim match `previousSeq: 1`?"*
   - If yes, Worker B proceeds and updates Jim's pointer to `#3`.
   - If no (e.g., `#1` is still running or lagged), Worker B refuses to process `#3` until `#1` finishes!

### Visual Sequence

```mermaid
sequenceDiagram
    autonumber
    actor P as Publisher (Stores Event History)
    participant Broker as NATS Streaming
    participant W_A as Worker A
    participant W_B as Worker B
    participant DB as User Accounts (Stores Last Processed Seq)

    rect rgba(120, 120, 120, 0.15)
    Note over P,Broker: Step 1: Publisher emits Event 1
    P->>Broker: Publish: Deposit Jim $70
    Note over Broker: NATS assigns Seq #1
    Broker-->>P: ACK with Seq #1 (Assumption!)
    Note over P: P records: Jim's Last Seq = #1
    Broker->>W_A: Dispatch Seq #1 to Worker A
    W_A->>DB: Apply Deposit $70, Save Jim.lastSeq = 1
    end

    rect rgba(120, 120, 120, 0.15)
    Note over P,Broker: Step 2: Publisher emits Event 2 (Mary)
    P->>Broker: Publish: Deposit Mary $40
    Note over Broker: NATS assigns Seq #2
    Broker-->>P: ACK with Seq #2
    Note over P: P records: Mary's Last Seq = #2
    Broker->>W_B: Dispatch Seq #2 to Worker B
    W_B->>DB: Apply Deposit $40, Save Mary.lastSeq = 2
    end

    rect rgba(120, 120, 120, 0.15)
    Note over P,Broker: Step 3: Publisher emits Event 3 (Jim again)
    Note over P: P looks up Jim's last seq $\rightarrow$ It was #1!<br/>Attaches previousSeq: 1
    P->>Broker: Publish: Withdraw Jim $100 (previousSeq: 1)
    Note over Broker: NATS assigns Seq #3
    Broker->>W_B: Dispatch Seq #3 to Worker B
    W_B->>DB: Check Jim's current lastSeq
    Note over W_B,DB: If lastSeq == 1: OK to process!<br/>If lastSeq != 1: STALL/REJECT!
    end
```

### Why Pattern 3 Fails in the Real World

Despite appearing mathematically sound, this pattern collapses under four concrete distributed systems limitations:

#### 1. The Asynchronous Broker Boundary (The Missing Sequence Number)
- When a publisher calls `client.publish('ticket:created', data, callback)`, the callback only confirms that the message was received by the broker (`guid`). 
- **The internal stream sequence number is NOT returned to the publisher in standard broker protocols!** 
- Sequence numbers are assigned deep inside the broker's commit log for consumers, making it impossible for the publisher to synchronously know what sequence number the broker chose.

#### 2. Publisher Multi-Instance Concurrency (Split-Brain History)
- In real deployments, the **Publisher Service itself runs multiple horizontal replicas** behind a load balancer.
- If Publisher Instance 1 publishes for Jim, Publisher Instance 2 has no immediate knowledge of the sequence number assigned unless they also synchronize through a central distributed lock, creating another massive bottleneck.

#### 3. Outbox Atomicity Violation
- If the publisher writes the event to its local history table, sends it to the broker, but crashes before recording the broker's sequence number confirmation, the publisher's history becomes corrupted or out of sync with the broker's actual commit log.

#### 4. The Deadlock of Rejected Messages
- If Worker B receives event `#3` and rejects it because event `#1` hasn't arrived yet, what does Worker B do with event `#3`?
- If it does not acknowledge event `#3`, NATS will keep redelivering event `#3` every `ackWait` period (spamming the worker).
- If it acknowledges and drops event `#3`, event `#3` is permanently lost.
- Stashing event `#3` in an in-memory queue risks memory overflow if event `#1` is delayed for minutes.

---

## Comparison Matrix: Why These 3 Solutions Fail

| Flawed Pattern | Core Idea | Fatal Flaw | Real-World Consequence |
| :--- | :--- | :--- | :--- |
| **Pattern 1: Global Sequence** | Check previous sequence number in a shared store before executing. | **Head-of-Line Blocking** across unrelated entities. | A timeout on Jim's account freezes Mary, Bob, and the entire platform. |
| **Pattern 2: Channel-Per-User** | Create a separate channel for every user/resource. | **Broker Channel & Resource Limits**. | Hits broker channel caps (e.g. 1,000 channels max), causing memory exhaustion. |
| **Pattern 3: Publisher Pointers** | Publisher tracks previous sequence and attaches it to payload. | **Protocol Asymmetry & Publisher Concurrency**. | Brokers don't return sequence IDs to publishers; fails across multiple publisher replicas. |

---

## The Correct Architectural Answer: Optimistic Concurrency Control (OCC)

Instead of relying on the **broker's sequence numbers** or the **publisher's memory**, the solution is to place the versioning authority directly inside the **resource itself** (the Database record).

1. **Entity Owns Its Version**:
   - The primary service that manages the resource (`Tickets Service`) owns an integer `version` field (starts at `1` or `0`).
   - Only this canonical service increments `version`.
2. **Publisher Emits Version in Every Event**:
   - When the Tickets Service updates state, it increments `version = version + 1` and embeds `{ id, price, version }` into the emitted event.
3. **Consumer Enforces Consecutive Version Transitions (`expectedVersion = currentVersion + 1`)**:
   - When the `Orders Service` receives an update event with version `V`:
     - It queries its replicated Ticket record where `id = event.id AND version = event.version - 1`.
     - **Match found**: Commit the update, set local record version to `V`, and **ACK** to NATS.
     - **Match NOT found (Missing prior version / Out of order)**: Do **NOT ACK** the message! Throw an error or let it time out (e.g. 30 seconds). NATS will redeliver it later after the missing predecessor arrives and is processed.
     - **Duplicate (event.version <= record.version)**: Ignore or ACK immediately (idempotent no-op).

---

### End-to-End Visual Flow: Tickets Publishing & Out-of-Order Delivery

The following diagrams illustrate the exact scenario from the lecture transcript:
1. Ticket `Q` is created at `$10` (`v1`), updated to `$50` (`v2`), and updated to `$100` (`v3`).
2. The events arrive out of order at `Orders Service` replicas (or fail transiently), trigger redelivery timeouts (30s `ackWait`), and self-heal strictly through record-level version checking.

#### Step 1: Canonical Ticket Service State & Event Generation

```mermaid
sequenceDiagram
    autonumber
    actor User as Client / User
    participant T_DB as Tickets DB (Canonical)
    participant T_SVC as Tickets Service
    participant NATS as NATS Streaming Server

    Note over T_DB: No record for Q

    User->>T_SVC: 1. POST /tickets { id: "Q", price: 10 }
    T_SVC->>T_DB: INSERT Ticket { id: "Q", price: 10, version: 1 }
    T_SVC->>NATS: Publish: TicketCreated { id: "Q", price: 10, version: 1 }

    Note over User,T_SVC: Rapid successive updates...

    User->>T_SVC: 2. PUT /tickets/Q { price: 50 }
    T_SVC->>T_DB: UPDATE Ticket Q SET price=50, version=2 WHERE version=1
    T_SVC->>NATS: Publish: TicketUpdated { id: "Q", price: 50, version: 2 }

    User->>T_SVC: 3. PUT /tickets/Q { price: 100 }
    T_SVC->>T_DB: UPDATE Ticket Q SET price=100, version=3 WHERE version=2
    T_SVC->>NATS: Publish: TicketUpdated { id: "Q", price: 100, version: 3 }
```

#### Step 2: Orders Service Handling Out-of-Order Delivery & Unacknowledged Timeouts

```mermaid
sequenceDiagram
    autonumber
    participant NATS as NATS Streaming (ackWait = 30s)
    participant Ord_A as Orders Worker A
    participant Ord_B as Orders Worker B
    participant O_DB as Orders DB (Replicated Tickets)

    Note over O_DB: Orders DB has NO Ticket Q yet

    Note over NATS,Ord_B: --- Initial Delivery (Event 1 fails, Event 2 arrives out of order) ---
    NATS->>Ord_A: Deliver [Event 1: Created Q, price: 10, v: 1]
    Note over Ord_A: Worker A crashes or encounters transient DB error!<br/>Event 1 is NOT ACKed.
    NATS->>Ord_B: Deliver [Event 2: Updated Q, price: 50, v: 2]
    Ord_B->>O_DB: Query Ticket WHERE id="Q" AND version=1 (v2 - 1)
    O_DB-->>Ord_B: Not Found! (DB has no v1)
    Note over Ord_B: ⚠️ Predecessor v1 missing!<br/>Do NOT ACK! Let message time out.

    Note over NATS,Ord_A: --- 30s Ack Timeout Expires on Event 1 ---
    Note over NATS: ⏰ ackWait (30s) expires for Event 1.<br/>NATS re-delivers Event 1!
    NATS->>Ord_A: REDELIVER [Event 1: Created Q, price: 10, v: 1]
    Ord_A->>O_DB: INSERT Ticket { id: "Q", price: 10, version: 1 }
    Ord_A-->>NATS: ACK Event 1
    Note over O_DB: State: { id: "Q", price: 10, version: 1 }

    Note over NATS,Ord_B: --- Event 3 Arrives Before Event 2 Redelivers ---
    NATS->>Ord_B: Deliver [Event 3: Updated Q, price: 100, v: 3]
    Ord_B->>O_DB: Query Ticket WHERE id="Q" AND version=2 (v3 - 1)
    O_DB-->>Ord_B: Not Found! (Current version is 1, not 2)
    Note over Ord_B: ⚠️ Version mismatch: expected v2, found v1.<br/>Do NOT ACK! Drop/error and let time out.

    Note over NATS,Ord_A: --- 30s Ack Timeout Expires on Event 2 ---
    Note over NATS: ⏰ ackWait (30s) expires for Event 2.<br/>NATS re-delivers Event 2!
    NATS->>Ord_A: REDELIVER [Event 2: Updated Q, price: 50, v: 2]
    Ord_A->>O_DB: Query Ticket WHERE id="Q" AND version=1 (v2 - 1)
    Ord_A-->>O_DB: Found! (v1 matches)
    Ord_A->>O_DB: UPDATE Ticket Q SET price=50, version=2 WHERE version=1
    Ord_A-->>NATS: ACK Event 2
    Note over O_DB: State: { id: "Q", price: 50, version: 2 }

    Note over NATS,Ord_B: --- 30s Ack Timeout Expires on Event 3 ---
    Note over NATS: ⏰ ackWait (30s) expires for Event 3.<br/>NATS re-delivers Event 3!
    NATS->>Ord_B: REDELIVER [Event 3: Updated Q, price: 100, v: 3]
    Ord_B->>O_DB: Query Ticket WHERE id="Q" AND version=2 (v3 - 1)
    Ord_B-->>O_DB: Found! (v2 matches)
    Ord_B->>O_DB: UPDATE Ticket Q SET price=100, version=3 WHERE version=2
    Ord_B-->>NATS: ACK Event 3
    Note over O_DB: State: { id: "Q", price: 100, version: 3 } ✅ Fully Converged!
```

#### Consumer Decision Logic Matrix

```mermaid
flowchart TD
    Recv["Receive Event { id, price, version }"] --> Query["Find Ticket in DB WHERE id = event.id"]
    Query --> Exists{"Ticket exists?"}

    Exists -- "No" --> IsV1{"Is event.version == 1?"}
    IsV1 -- "Yes (Creation)" --> Insert["INSERT Ticket { id, price, version: 1 }"] --> Ack["ACK to NATS"]
    IsV1 -- "No (Out of Order)" --> RejectNoAck1["Do NOT ACK (Throw Error / Wait for ackWait timeout)"]

    Exists -- "Yes" --> CheckVer{"dbTicket.version == event.version - 1 ?"}
    CheckVer -- "Yes (Next consecutive version)" --> Update["UPDATE Ticket SET price = event.price, version = event.version"] --> Ack
    CheckVer -- "No: event.version <= dbTicket.version" --> Duplicate["Duplicate / Stale event $\rightarrow$ ACK immediately (No-op)"]
    CheckVer -- "No: event.version > dbTicket.version + 1" --> RejectNoAck2["Future event ahead of order $\rightarrow$ Do NOT ACK (Wait for ackWait redelivery)"]
```

