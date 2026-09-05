# StubHub Microservices Learning Project

A hands-on ticket marketplace used to learn backend and microservice design by building small, runnable vertical slices.

This repository is not affiliated with StubHub and is not intended for production use. It deliberately favors visible service boundaries, explicit failure handling, and local exercises over production infrastructure.

## What this project teaches

- service ownership and database-per-service boundaries;
- synchronous decisions versus asynchronous committed facts;
- ticket reservation, payment, expiration, and race handling;
- idempotency, retries, transactional publication records, and Redis Streams recovery;
- authentication, authorization, internal service calls, and moderation workflows;
- local Docker and Kubernetes development with observable request and event flows.

## Services

| Workspace | Responsibility |
|---|---|
| `client` | Next.js browser UI for identity, tickets, orders, checkout, reporting, and moderation |
| `auth` | Accounts, credentials, email verification, JWT identity, roles, and internal user lookup |
| `tickets` | Ticket listings, ownership, availability, reservation, release, and sold state |
| `orders` | Purchase intent, captured prices, order lifecycle, payment coordination, and expiration |
| `moderation` | Buyer reports, immutable evidence, admin review, and report resolution |
| `event-bus` | Shared Redis Streams delivery helpers |
| `common` | Service-agnostic HTTP and authentication utilities |

Each stateful backend service owns its SQLite database. Services communicate through explicit HTTP contracts and durable Redis Streams messages; they do not share databases.

## Implemented learning slices

- account signup, email verification, sign-in, refresh, and sign-out;
- ticket creation, editing, browsing, reservation, release, and sale;
- pending orders with price snapshots, payment attempts, expiration, and recovery workers;
- durable event publication and idempotent consumption;
- completed-order seller reporting and an admin moderation workflow.

The design documents intentionally show decisions in progress. They are learning checkpoints, not claims of production completeness.

## Run locally

### Prerequisites

- Node.js 24 or newer;
- npm;
- Docker Desktop with Kubernetes enabled;
- `kubectl` and Skaffold.

### Start the full local environment

```bash
npm install
npm run dev
```

Skaffold builds the services, applies the manifests in `infra/k8s`, and forwards:

- application: <http://localhost:3000>
- Mailpit: <http://localhost:8025>
- Identity API: `http://localhost:3001`
- Tickets API: `http://localhost:3002`
- Orders API: `http://localhost:3003`
- Moderation API: `http://localhost:3004`
- Redis: `localhost:6379`

Stop Skaffold with `Ctrl+C`, then remove the local resources:

```bash
npm run delete
```

The committed Kubernetes secrets and `.env.example` values are local learning defaults only. Replace them before using any part of this project outside an isolated local environment.

## Useful workspace checks

```bash
npm run typecheck
npm run build
```

Individual development commands are available as `npm run dev:client`, `dev:identity`, `dev:tickets`, `dev:orders`, and `dev:moderation` when their dependencies and environment variables are already running.

## Learning documentation

- [Documentation Hub](docs/README.md)
- [Service-design course](docs/service-design/index.md)
- [System-design journal](docs/system_design/index.md)
- [Commerce service-boundary baseline](docs/specifications/service-boundary.md)
- [Service-design growth gaps](docs/goals/service-design-growth-gaps.md)
- [Order data capture pattern](docs/patterns/order-data-capture-pattern.md)

## Project status

Active learning project. APIs, schemas, infrastructure, and documentation may change as each exercise exposes a better boundary or recovery rule.
