# Design Spec: Repository Portfolio Positioning & Marketing Preparation

- **Date:** 2026-09-07
- **Topic:** Transforming the StubHub Microservices Repository into a Flagship Proof-of-Work Asset for Remote Senior/Staff Backend Roles
- **Target Audience:** Engineering Managers, Staff Engineers, and Technical Recruiters at US/EU/Global remote software companies

---

## 1. Executive Summary & Goal

This repository contains robust distributed systems patterns: database-per-service isolation, concurrency-safe ticket reservations, transactional outbox with atomic worker leasing, poison-message dead lettering, and idempotent stream consumption. However, its public presentation currently reads as a generic "microservices learning tutorial."

The goal of this initiative is to reposition the repository as an **authoritative production-grade distributed systems case study** that demonstrates high-signal architectural judgment, data consistency guarantees, and deep module engineering to win high-paying remote backend engineering roles.

---

## 2. Positioning & Narrative Architecture

### 2.1 The Core Differentiation (Why This Stands Out)
99% of microservice portfolio projects are superficial clones (e.g. MERN stack with synchronous REST calls and shared databases). They break as soon as:
1. Two buyers click "Buy" on the same ticket simultaneously.
2. A database commit succeeds but the message broker crashes before publishing (dual-write data loss).
3. A consumer crashes mid-processing and duplicate redeliveries cause double-billing.

This repository directly addresses and solves these production distributed systems failure modes.

### 2.2 Narrative Pillars
1. **Concurrency Without Distributed Locks:** Guarded SQL transitions (`lockedByOrderId`) and bounded reservation leases avoiding global bottlenecks.
2. **Resilient Transactional Outbox:** Zero-data-loss event publishing using SQLite `BEGIN IMMEDIATE` row-leasing (`locked_until`), correlation IDs, and poison-message handling.
3. **Deep Module Design & Information Hiding:** Encapsulated Redis Streams/messaging mechanics hidden behind clean intent-based domain APIs (`enqueueOrderFact`, `startOrderEventsConsumer`).
4. **Idempotent At-Least-Once Delivery:** Deduplicating inbox tables (`processed_order_events`) and transactional ACKs preventing phantom state mutations.

---

## 3. Concrete Repository Deliverables

### 3.1 Executive README Overhaul
Transform `README.md` from a classroom syllabus into an engineering case study:
- **Hero & Problem Statement:** High-impact hook highlighting concurrency, fault tolerance, and eventual consistency.
- **Interactive System Topology Diagram:** Clean Mermaid diagram illustrating service boundaries, HTTP sync paths, and asynchronous outbox/event-stream pipelines.
- **Architectural Decision Matrix (ADRs):**
  - Redis Streams vs. Redis Pub/Sub (durable consumer groups vs. silent message loss).
  - Synchronous reservation vs. asynchronous choreographies (authoritative availability vs. eventual inconsistency).
  - Database-level row leasing vs. distributed locks like Redlock (single source of truth vs. split-brain latency).
- **Core Invariant Catalog:** Explicit business rules and the exact code locations defending them.
- **1-Command Verification Smoke Drill:** A script/command an engineering manager can run to observe the concurrency and outbox mechanics in real-time.

### 3.2 High-Signal Technical Write-ups (Docs Portfolio)
Create three publication-ready engineering deep-dives in `docs/case-studies/`:
1. `01-preventing-double-booking-concurrency-without-distributed-locks.md`:
   - Detailed walkthrough of ticket reservation races.
   - Optimistic concurrency, state machine transitions, and lease expirations.
2. `02-transactional-outbox-with-atomic-worker-leasing.md`:
   - The dual-write hazard.
   - SQLite atomic leasing (`BEGIN IMMEDIATE`), multi-worker safety, and dead-letter handling.
3. `03-deep-modules-and-idempotent-event-driven-architecture.md`:
   - Applying John Ousterhout's *A Philosophy of Software Design* to microservices.
   - Inbox pattern and graceful consumer shutdown.

### 3.3 Repeatable Concurrency & Failure Drill (Script)
Create a standalone demonstration script (e.g., `scripts/demo-concurrency-race.ts` or `scripts/smoke-test-portfolio.ts`) that:
- Simulates concurrent purchases on a single ticket.
- Prints clear, formatted output showing winner vs. rejected requests (409 Conflict).
- Traces outbox publication and consumer ACK in real-time.

---

## 4. Promotion & Outreach Playbook

Provide an actionable guide (`docs/portfolio/marketing-and-outreach-guide.md`) containing:
- **LinkedIn Authority Post Templates:** Ready-to-use hooks, text, and diagram suggestions.
- **Cold Outreach Direct Message Templates:** Non-spammy, high-signal scripts tailored for Tech Leads and Engineering Managers.
- **Interview Talking Points:** Structured STAR-method answers anchored to this codebase for System Design and Concurrency interview rounds.

---

## 5. Non-Goals & Scope Boundaries
- **No infrastructure bloat:** Do not introduce cloud terraform, AWS lambdas, or expensive SaaS integrations. Keep everything reproducible locally via Docker/Skaffold/Node.js.
- **No breaking changes to service code:** Preserve existing working service logic, routes, and tests.
- **No fake marketing fluff:** All claims must be grounded in actual, runnable code inside the repository.
