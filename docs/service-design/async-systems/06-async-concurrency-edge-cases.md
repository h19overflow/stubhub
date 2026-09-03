# Asynchronous Event Processing: Failure Modes and Concurrency Edge Cases

This document captures the core failure modes, concurrency anomalies, and edge cases inherent to asynchronous event-driven microservice architectures, illustrated with step-by-step sequence and flow diagrams.

---

## Executive Summary: The Illusion of Sequential Order

In a naive synchronous mental model, operations occur sequentially:
1. `Deposit $70` $\rightarrow$ Balance: `$70`
2. `Deposit $40` $\rightarrow$ Balance: `$110`
3. `Withdraw $100` $\rightarrow$ Balance: `$10` (Valid, balance remains $\ge \$0$)

In a distributed, asynchronous event-driven system with queue groups and horizontal scaling, **every single event can reorder, duplicate, stall, or fail independently**.

---

## Case 1: Listener Error & Redelivery Window Delay

### The Scenario
A listener encounters a transient error (locked file, DB lock, timeout). Because manual ACK is enabled, it does not acknowledge the message. The broker waits for the `ackWait` timeout (e.g. 30 seconds) before redelivering. In that 30-second gap, subsequent events continue to be published and processed out of sequence.

### Visual Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor P as Publisher
    participant Broker as Event Broker (Queue Group)
    participant W1 as Worker 1
    participant W2 as Worker 2
    participant DB as Storage / Database (Initial: $0)

    P->>Broker: Publish: Deposit $70
    Broker->>W1: Dispatch: Deposit $70
    Note over W1: Processing fails! (File locked / Error)<br/>Worker 1 does NOT send ACK.
    
    Note over P,Broker: While Worker 1 is in 30s ackWait timeout...
    P->>Broker: Publish: Deposit $40
    Broker->>W2: Dispatch: Deposit $40
    W2->>DB: Write: Balance = $0 + $40 = $40
    W2-->>Broker: ACK Deposit $40
    
    P->>Broker: Publish: Withdraw $100
    Broker->>W2: Dispatch: Withdraw $100
    W2->>DB: Attempt: $40 - $100 = -$60!
    Note over W2,DB: 💥 CRITICAL ERROR: Balance < $0!

    Note over Broker: 30s ackWait expires for Deposit $70
    Broker->>W2: Redeliver: Deposit $70 (Too late!)
```

### Key Takeaway
ACK timeouts preserve message delivery, but they **destroy event ordering**. Unacknowledged messages stall while independent subsequent messages bypass them.

---

## Case 2: Unequal Worker Speeds (Fast vs. Slow Worker Race)

### The Scenario
Both workers are running and healthy, but **Worker 1 is sluggish** (CPU throttle, garbage collection pause, or dealing with a backlog of other tasks). **Worker 2 is idle and ultra-fast**. Even though events are emitted in chronological order, Worker 2 finishes its event before Worker 1 even starts.

### Visual Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor P as Publisher
    participant Broker as Event Broker
    participant W1 as Worker 1 (Heavy Load / Laggy)
    participant W2 as Worker 2 (Idle / Fast)
    participant DB as Storage / Database (Initial: $0)

    P->>Broker: 1. Publish: Deposit $70
    Broker->>W1: Assign: Deposit $70
    Note over W1: Queued in Worker 1 thread pool...<br/>(Delayed by GC / high load)

    P->>Broker: 2. Publish: Deposit $40
    Broker->>W1: Assign: Deposit $40 (Queued behind $70)

    P->>Broker: 3. Publish: Withdraw $100
    Broker->>W2: Assign: Withdraw $100
    
    Note over W2: Worker 2 has 0 backlog!<br/>Executes immediately!
    W2->>DB: Read Balance: $0
    W2->>DB: Attempt: $0 - $100 = -$100!
    Note over W2,DB: 💥 CRITICAL ERROR: Overdraft violation!

    Note over W1: Worker 1 finally unfreezes...
    W1->>DB: Process Deposit $70 (Balance: $70)
    W1->>DB: Process Deposit $40 (Balance: $110)
```

### Key Takeaway
Queue groups **distribute** work; they **do not serialize** execution across multiple consumers. Parallel processing intrinsically leads to race conditions if dependencies exist between events.

---

## Case 3: Ungraceful Crash & The Heartbeat "Zombie" Window

### The Scenario
Worker 1 crashes abruptly (`SIGKILL`, OOM crash, power cut) without calling `client.close()`. The broker does not know the worker is dead until heartbeat pings fail after 10–20 seconds. During this window, the broker continues feeding messages into the black hole of the dead worker.

### Visual Flow & Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor P as Publisher
    participant Broker as Event Broker
    participant W1 as Worker 1 (Crashes!)
    participant W2 as Worker 2 (Healthy)
    participant DB as Storage / Database (Initial: $0)

    Note over W1: 💀 Worker 1 crashes abruptly (SIGKILL)<br/>No graceful close sent!
    Note over Broker,W1: Broker still thinks Worker 1 is alive<br/>(Awaiting heartbeat window: ~15s)

    P->>Broker: Publish: Deposit $70
    Broker->>W1: Route to Worker 1 (Lost / Ignored)

    P->>Broker: Publish: Deposit $40
    Broker->>W1: Route to Worker 1 (Lost / Ignored)

    P->>Broker: Publish: Withdraw $100
    Broker->>W2: Route to Worker 2 (Round-robin)

    W2->>DB: Read Balance: $0
    W2->>DB: Attempt: $0 - $100 = -$100!
    Note over W2,DB: 💥 CRITICAL ERROR: Withdrawals proceed while deposits are trapped!

    Note over Broker: Heartbeats fail $\rightarrow$ Worker 1 marked DEAD.<br/>Broker redelivers deposits to Worker 2.
```

### Key Takeaway
Always register graceful shutdown hooks (`SIGINT`, `SIGTERM` $\rightarrow$ `client.close()`). When a client explicitly closes, the broker removes it from the consumer group immediately, avoiding the zombie delivery black hole.

---

## Case 4: Duplicate Delivery via Ack-Timeout Race Condition

### The Scenario
Events can occur days apart. At a later time, Worker 1 receives a legitimate withdrawal event. It takes 29.99 seconds to complete due to high disk I/O. At the 30.00-second mark, the broker assumes Worker 1 died and re-emits the event to Worker 2. Both workers eventually apply the deduction, deducting the money twice!

### Visual Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor P as User / Publisher
    participant Broker as Event Broker (ackWait = 30s)
    participant W1 as Worker 1 (Slow I/O)
    participant W2 as Worker 2 (Normal)
    participant DB as Storage / Database (Initial Balance: $110)

    P->>Broker: Publish: Withdraw $100 (Event ID: evt-999)
    Broker->>W1: Deliver: Withdraw $100 (Timer starts: 0.00s)

    Note over W1: Slow disk read takes 29.99 seconds...

    Note over Broker: ⏰ 30.00s TIMEOUT REACHED!<br/>Broker assumes Worker 1 died.
    Broker->>W2: REDELIVER: Withdraw $100 (Event ID: evt-999)

    Note over W1: 30.01s: Worker 1 finishes reading!
    W1->>DB: Deduct $100 $\rightarrow$ Balance becomes $10
    W1-->>Broker: Send late ACK (Ignored / too late)

    Note over W2: Worker 2 receives redelivery!
    W2->>DB: Read Balance: $10
    W2->>DB: Deduct $100 $\rightarrow$ Balance becomes -$90!
    W2-->>Broker: Send ACK
    Note over W2,DB: 💥 DUPLICATE EXECUTION: Same withdrawal applied twice!
```

### Key Takeaway
Network timeouts do not mean work failed; they only mean confirmation wasn't received in time. In distributed systems, **at-least-once delivery guarantees duplicate deliveries**.

---

## Summary Matrix

```mermaid
graph TD
    E1["Case 1: Processing Error<br/>(Redelivery stall)"] --> S1["Solution: Optimistic Concurrency Control (OCC)<br/>Reject out-of-order versions"]
    E2["Case 2: Worker Speed Skew<br/>(Parallel race condition)"] --> S2["Solution: Entity Partitioning<br/>Same entity pinned to same partition/worker"]
    E3["Case 3: Zombie Worker<br/>(Dead without close)"] --> S3["Solution: Fast Graceful Shutdown<br/>Hook SIGINT/SIGTERM to client.close()"]
    E4["Case 4: ACK Timeout Race<br/>(Duplicate execution)"] --> S4["Solution: Idempotency Records<br/>Deduplicate by Event ID in DB transaction"]
```
