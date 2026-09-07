# Repository Portfolio Positioning & Marketing Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the StubHub microservices codebase into a high-converting distributed systems portfolio asset and case-study suite targeting remote Senior/Staff Backend and Distributed Systems roles.

**Architecture:** Create an executive README structured like an engineering RFC, 3 deep technical case studies targeting distributed systems hiring criteria (concurrency without global locks, transactional outbox with atomic leasing, deep module design with idempotent consumers), a runnable concurrency race verification drill, and a cold outreach / marketing playbook.

**Tech Stack:** TypeScript, Node.js 24, SQLite `node:sqlite`, Redis Streams, Next.js, Markdown / Mermaid.

**Spec:** `docs/superpowers/specs/2026-09-07-repo-positioning-and-promotion-design.md`

## Global Constraints

- Ground all architectural claims in actual working repository code (exact file paths, SQL queries, and method names).
- Do not add unneeded external dependencies or mock frameworks.
- Preserve existing working code, tests, and service boundaries.
- Adhere to the project's Ponytail simplicity and Ousterhout deep module design guidelines.

---

### Task 1: Executive README Overhaul

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Architectural decisions and invariants from `docs/system_design/invariants.md`, `docs/specifications/service-boundary.md`, `orders/src/messaging/index.ts`, and `tickets/src/orders/order-events-consumer.ts`.
- Produces: Executive README with high-impact hero, system topology diagram, Architectural Decision Record (ADR) matrix, core invariant catalog, and fast smoke check.

- [ ] **Step 1: Draft Executive Hero & Visual Topology**
Write the hero section framing this as an event-driven distributed ticket marketplace tackling high-concurrency races, dual-write hazards, and idempotent event processing. Add a clean Mermaid system topology diagram.

- [ ] **Step 2: Add Architectural Decision Records (ADRs) Matrix**
Include the comparative decision table explaining why Redis Streams beat Pub/Sub, why synchronous reservation was chosen over eventual choreography, and why SQLite atomic row leasing beat external distributed locks.

- [ ] **Step 3: Document Core Business Invariants & Exact Code Anchors**
Catalog the invariants (Zero Double-Booking, Zero Event Loss, Idempotent Consumption) with direct links to `tickets/src/services/` and `orders/src/messaging/`.

- [ ] **Step 4: Update Quickstart & Verification Instructions**
Provide clear, frictionless instructions for spinning up services locally or running the focused concurrency verification drill.

- [ ] **Step 5: Review and Format**
Verify formatting and Mermaid diagram syntax.

---

### Task 2: Case Study 1 — Preventing Double-Booking Without Global Distributed Locks

**Files:**
- Create: `docs/case-studies/01-preventing-double-booking-concurrency-without-distributed-locks.md`

**Interfaces:**
- Consumes: Tickets reservation SQL queries, guarded state transitions, and `lockedByOrderId` logic from `tickets/src/`.
- Produces: A deep-dive article breaking down the concurrency challenge, why distributed locks (e.g. Redlock) introduce operational hazards, and how optimistic database guards deliver zero double-booking.

- [ ] **Step 1: Write Problem Statement & Failure Scenarios**
Explain the ticket reservation race when multiple buyers hit checkout simultaneously. Detail the latency and failure modes of distributed locks across networks.

- [ ] **Step 2: Detail the Guarded State Machine & SQL Invariants**
Provide the exact SQL transition logic (`UPDATE tickets SET lockedByOrderId = ? WHERE id = ? AND lockedByOrderId IS NULL AND status = 'available'`) and state transitions (`available` $\to$ `reserved` $\to$ `sold`/`available`).

- [ ] **Step 3: Explain Expiration & Safe Release**
Walk through the lease expiration mechanism, preventing zombie locks, and why release commands must verify `lockedByOrderId`.

- [ ] **Step 4: Include Sequence Diagram & Review**
Render a clear Mermaid sequence diagram illustrating simultaneous reservation requests where one wins and one is cleanly rejected.

---

### Task 3: Case Study 2 — Implementing a Transactional Outbox with Atomic Worker Leasing in SQLite

**Files:**
- Create: `docs/case-studies/02-transactional-outbox-with-atomic-worker-leasing.md`

**Interfaces:**
- Consumes: `orders/src/messaging/index.ts`, `orders/src/db/migrations/`, and worker leasing logic.
- Produces: An engineering case study explaining the dual-write problem, transactional outbox schema, SQLite `BEGIN IMMEDIATE` row-leasing, and multi-pod safety.

- [ ] **Step 1: Deconstruct the Dual-Write Problem**
Explain why calling `redis.xAdd()` inside an HTTP handler after a DB commit creates silent data loss on network drops or process crashes.

- [ ] **Step 2: Detail the Outbox Schema & Atomic Leasing Mechanism**
Explain the `order_event_publications` table schema, `locked_by`, `locked_until`, and how workers atomically claim batches without multi-pod race conditions.

- [ ] **Step 3: Cover Poison-Message Handling & Dead-Letter Resilience**
Show how retry limits, backoff, and circuit-breaking protect worker pipelines from stalling on malformed payloads.

- [ ] **Step 4: Add Architecture Flow Diagram & Review**
Add a Mermaid diagram tracing: Database Transaction $\to$ Outbox Table $\to$ Worker Lease $\to$ Redis Streams Dispatch $\to$ Mark Published.

---

### Task 4: Case Study 3 — Deep Module Design & Idempotent Event Consumption

**Files:**
- Create: `docs/case-studies/03-deep-modules-and-idempotent-event-driven-architecture.md`

**Interfaces:**
- Consumes: John Ousterhout's *A Philosophy of Software Design* principles applied in `orders/src/messaging/index.ts` and `tickets/src/orders/order-events-consumer.ts`.
- Produces: A case study showing how to hide messaging mechanics behind cohesive domain interfaces and ensure idempotent stream consumption.

- [ ] **Step 1: The Problem of "Classitis" and Leaky Abstractions in Microservices**
Analyze typical microservices tutorials where Redis handles, raw streams, and serialization logic are splattered across HTTP controllers.

- [ ] **Step 2: Applying Deep Module Design to Messaging**
Show the interface contrast: callers invoke `enqueueOrderFact(tx, fact)` while the module encapsulates envelopes, serialization, correlation IDs, and table queries.

- [ ] **Step 3: Idempotent Consumer & Inbox Pattern**
Explain why at-least-once delivery is inevitable, and how `processed_order_events` with transaction-scoped ACKs guarantees convergent state.

- [ ] **Step 4: Graceful Shutdown & Drain Loops**
Detail how consumers cleanly drain in-flight messages before process exit to avoid zombie processing states.

---

### Task 5: Interactive Concurrency Race Verification Drill

**Files:**
- Create: `scripts/portfolio/demo-concurrency-drill.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Node.js `node:sqlite`, direct service state machines, or local service HTTP endpoints.
- Produces: A standalone, zero-dependency script demonstrating concurrency handling with formatted terminal output; runnable via `npm run demo:concurrency`.

- [ ] **Step 1: Write Concurrency Demonstration Script**
Implement a script using native `node:sqlite` that simulates two or more concurrent actors attempting to reserve the exact same ticket simultaneously, showing:
1. Thread/Actor 1 successfully acquiring reservation lease.
2. Thread/Actor 2 rejected with conflict guard.
3. Outbox row insertion and atomic worker lease claim.
4. Clean, colorful terminal logging with zero external dependencies.

- [ ] **Step 2: Add Script to `package.json`**
Add `"demo:concurrency": "node --experimental-strip-types scripts/portfolio/demo-concurrency-drill.ts"` to `package.json`.

- [ ] **Step 3: Run Script and Verify Output**
Execute `npm run demo:concurrency` and verify deterministic output.

---

### Task 6: Promotion, Marketing & Outreach Playbook

**Files:**
- Create: `docs/portfolio/marketing-and-outreach-guide.md`

**Interfaces:**
- Consumes: Case studies and repository artifacts.
- Produces: Comprehensive guide containing LinkedIn post copy, cold outreach scripts for hiring managers, and System Design interview answers.

- [ ] **Step 1: Draft High-Converting LinkedIn Posts**
Create 3 copy-paste ready LinkedIn posts with hooks, code/diagram suggestions, and call-to-actions linking the repo.

- [ ] **Step 2: Create Targeted Outreach DM Templates**
Draft low-friction, high-signal outreach messages for Engineering Managers, Staff Engineers, and Recruiters at remote US/EU companies.

- [ ] **Step 3: Compile System Design Interview STAR Talking Points**
Document exact talking points mapping common distributed systems interview questions directly to patterns in this repository.

---

### Task 7: Full Verification & Sanity Check

**Files:**
- Inspect: All created and modified files.

- [ ] **Step 1: Run Workspace Checks**
Execute `npm run typecheck` to ensure no TypeScript regressions.

- [ ] **Step 2: Run Concurrency Demo**
Execute `npm run demo:concurrency` to confirm terminal output is crisp and functional.

- [ ] **Step 3: Final Link & Reference Audit**
Audit all cross-links between `README.md`, `docs/case-studies/`, and `docs/portfolio/`.
