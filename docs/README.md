# StubHub Marketplace Documentation Hub

Welcome to the documentation hub for the StubHub Ticket Marketplace hands-on microservices workspace. This directory is organized into focused, thematic buckets.

---

## Documentation Buckets

```text
docs/
├── specifications/      # Authoritative requirements & service boundary baseline
├── patterns/            # Cross-cutting architectural & messaging patterns
├── walkthroughs/        # Code walkthroughs & implementation reading guides
├── system_design/       # Journeys, state machines, invariants & API contracts
├── service-design/      # Hands-on service design lessons & async systems companion
├── goals/               # Learning milestones & growth objectives
└── superpowers/         # Feature specifications & execution plans
```

---

## 1. Specifications (`specifications/`)

Foundational business, technical, and service boundary definitions.

- [`service-boundary.md`](specifications/service-boundary.md): **Source of truth** for service names, responsibilities, and data ownership.
- [`product-requirements.md`](specifications/product-requirements.md): User stories and domain requirements for the ticket marketplace.
- [`technical-requirements.md`](specifications/technical-requirements.md): Technical constraints, database per service, security, and runtime rules.
- [`boundary-auditing.md`](specifications/boundary-auditing.md): Audit rubric for checking service independence and data leakage.

---

## 2. Architectural Patterns (`patterns/`)

System designs and patterns spanning multiple services.

- [`messaging-architecture.md`](patterns/messaging-architecture.md): 4-stage event lifecycle pipeline (Outbox $\rightarrow$ Dispatch $\rightarrow$ Ingest $\rightarrow$ Inbox Convergence).
- [`order-data-capture-pattern.md`](patterns/order-data-capture-pattern.md): 7-step data capture ensuring price snapshots survive boundary crossings.
- [`order-id-flow.md`](patterns/order-id-flow.md): Sequence diagram explaining where the order ID originates and how it flows to the UI.
- [`ssr-jwt-cookie-authentication.md`](patterns/ssr-jwt-cookie-authentication.md): Why Server-Side Rendering (SSR) requires forwarding `HttpOnly` cookies.
- [`common-workspace-package.md`](patterns/common-workspace-package.md): Clear boundaries for what belongs in the `@stubhub/common` private package.

---

## 3. Code Walkthroughs & Guides (`walkthroughs/`)

Practical, step-by-step guides for navigating the codebase.

- [`backend-git-diff-walkthrough.md`](walkthroughs/backend-git-diff-walkthrough.md): Tracing one complete purchase across Tickets, Orders, and Identity.
- [`frontend-git-diff-walkthrough.md`](walkthroughs/frontend-git-diff-walkthrough.md): The thin frontend chain: Pages Router $\rightarrow$ Feature UI $\rightarrow$ Custom Hooks $\rightarrow$ API Client.
- [`orders-tickets-auth-reading-guide.md`](walkthroughs/orders-tickets-auth-reading-guide.md): The recommended reading order for understanding the commerce vertical slice.

---

## 4. System Design (`system_design/`)

Domain analysis and distributed systems engineering artifacts.

- [`index.md`](system_design/index.md): The 10-step System Design Journal.
- [`Arch/`](system_design/Arch/): C4 Context and Container diagrams, event broker comparisons.
- [`State Machines/`](<system_design/State Machines/>): Explicit state diagrams for Tickets, Orders, and Payments.
- [`journies/`](system_design/journies/): Plain-language business journeys.
- [`events.md`](system_design/events.md): Commerce event contracts and topology.
- [`event_contracts_and_deep_modules.md`](system_design/event_contracts_and_deep_modules.md): Strongly-typed contracts and deep module design.
- [`api_contracts.md`](system_design/api_contracts.md): Public and internal HTTP endpoints and error handling.
- [`data_and_consistency.md`](system_design/data_and_consistency.md): Database schemas, transaction boundaries, and CAS predicates.

---

## 5. Service Design Course (`service-design/`)

Foundational lessons on building backend distributed systems from first principles.

- [`index.md`](service-design/index.md): Lessons 01–10 on ownership, synchronous vs. asynchronous communication, and durable delivery.
- [`async-systems/`](service-design/async-systems/): Advanced companion translating external course patterns (NATS Streaming, Bull, MongoDB) into production patterns (Redis Streams, Transactional Outbox, SQLite).
