# Ticket Marketplace Technical Requirements

## Purpose

This is the technical companion to `product-requirements.md`. It defines the
engineering constraints, invariants, implementation order, runtime
requirements, and design questions that must be answered before implementation.

It intentionally does not choose the architecture. In particular, it does not
choose service boundaries, databases, event-bus products, authentication
session models, payment flow, Kubernetes topology, or AWS resource types.
Those decisions should be made after reviewing the product requirements and
before building the corresponding slice.

## 1. Fixed technology inputs

The implementation must use:

- TypeScript for application code.
- Express for HTTP services/APIs.
- nodemon for the local development restart loop.
- Axios for HTTP calls where the selected design requires them.
- Docker for packaging and local runtime isolation.
- Kubernetes for orchestration.
- Skaffold for the local Kubernetes build/deploy/development loop.
- AWS as the hosting platform.
- Pulumi written in TypeScript for infrastructure-as-code.

These choices do not determine how many services exist, how data is stored, or
which component owns a workflow.

## 2. Technical scope

The implementation must support these functional areas from the product file:

- Account creation, sign-in, and sign-out.
- Listing creation, display, detail, and price editing.
- Available-ticket discovery.
- Purchase intent and temporary locking.
- Order visibility and lifecycle.
- Automatic expiration and unlock.
- Stripe-backed payment.
- The browser journey shown by the mockups.
- Real persistent databases.
- A production-grade event bus.
- Local Docker/Kubernetes/Skaffold operation.
- AWS hosting provisioned with Pulumi Python.

This is an inventory of required behavior, not a service list.

## Baseline domain data types

The first design baseline contains four business records:

1. `User`
2. `Ticket`
3. `Order`
4. `Charge`

These are domain records, not necessarily four services or four databases.
That ownership decision remains open. Data passed through HTTP or the event bus
should use purpose-specific DTOs rather than sending an entire record by
default.

### User

```ts
type User = {
  id: string;
  email: string;
  createdAt: string;
};
```

Rules:

- `id` is the stable identity referenced by tickets and orders.
- Email is the account's login identity and must obey the chosen normalization
  and uniqueness rules.
- Password hashes, raw passwords, reset secrets, sessions, and signing tokens
  are not part of a transport `User` object.
- Public ticket responses should not expose a seller's email by default.

### Ticket

```ts
type Ticket = {
  id: string;
  eventName: string;
  price: Money;
  ownerId: string;
  status: "available" | "locked" | "sold";
  lockedByOrderId?: string;
  lockExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
};
```

Rules:

- `ownerId` references `User.id`; the full user is not embedded.
- `eventName` is the simplest baseline because the product does not yet
  include a separate event catalog.
- A ticket can be edited only while it is available.
- A locked ticket records enough information to identify the active order and
  its deadline.
- A sold ticket is no longer available for a new order.
- `status`, `lockedByOrderId`, and `lockExpiresAt` must not be trusted from a
  client request; they are server-owned state.

### Order

```ts
type Order = {
  id: string;
  userId: string;
  ticketId: string;
  amount: Money;
  status: "pending" | "complete" | "expired" | "cancelled";
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};
```

Rules:

- `userId` references the buyer's `User.id`.
- `ticketId` references the purchased `Ticket.id`.
- `amount` is the authoritative price snapshot for this order. It must not be
  reread from a later ticket edit during payment.
- A pending order has an expiration deadline.
- A complete order is not payable again.
- An expired or cancelled order is not payable.
- The initial baseline does not create a separate `Lock` record. The lock is
  represented by the relationship between a pending `Order` and the locked
  `Ticket`. A separate reservation record can be introduced only if the
  chosen design proves it necessary.

### Charge

```ts
type Charge = {
  id: string;
  orderId: string;
  amount: Money;
  status: "pending" | "succeeded" | "failed";
  providerChargeId?: string;
  failureCode?: string;
  createdAt: string;
  updatedAt: string;
};
```

Rules:

- `Charge` is the application's record of a payment attempt, not a copy of a
  provider object and not a place for card data.
- `orderId` references the order being charged.
- The charge amount must equal the authoritative order amount.
- An order may have multiple failed attempts but at most one successful
  terminal charge.
- `providerChargeId` is a safe provider reference when one exists.
- `failureCode` contains a non-sensitive, displayable classification only.
- Raw card number, expiration, security code, and provider secrets are never
  stored in `Charge`.

### Money

```ts
type Money = {
  amountMinor: number;
  currency: string;
};
```

`amountMinor` is an integer in the currency's smallest unit, such as cents for
USD. The currency must be explicit. Floating-point values must not be the
authoritative representation for ticket prices, orders, or charges.

### Relationships

The baseline relationships are:

- One `User` can own many `Ticket` records.
- One `User` can create many `Order` records.
- One `Ticket` can have historical orders, but only one active pending order.
- One `Order` references exactly one buyer and one ticket.
- One `Order` can have zero or more `Charge` attempts.
- One `Order` can have at most one successful `Charge`.

Use identifiers between records. Embed a snapshot only when it protects a
business invariant, such as `Order.amount` preserving the price at lock time.

### Data passed between components

The default transport rule is to send the smallest data needed for the
operation:

- Authentication context: `userId`, and only the identity claims required by
  the receiving operation.
- Ticket listing/read: ticket identity, event name, price, and availability;
  do not expose private order or payment data.
- Purchase/order creation: `userId`, `ticketId`, order identity if already
  allocated, amount snapshot, and expiration deadline.
- Expiration: `orderId`, `ticketId`, and the expiration timestamp.
- Charge processing: `chargeId`, `orderId`, amount, status, and safe provider
  reference.

The complete record may be used inside its owning component, but it should not
become the default payload for every HTTP request or event.

### Event transport envelope

The event envelope is transport metadata, not a fifth domain entity:

```ts
type EventEnvelope<T> = {
  eventId: string;
  eventType: string;
  version: number;
  occurredAt: string;
  correlationId?: string;
  data: T;
};
```

The event catalog, command/fact distinction, versioning rules, and delivery
semantics remain design decisions. The envelope must not contain passwords,
raw tokens, card data, or other secrets.

## 3. Non-negotiable correctness invariants

These invariants must remain true regardless of the selected architecture.

### 3.1 One ticket has one valid lock winner

If two users attempt to purchase the same available ticket concurrently, at
most one obtains a valid lock. A read that was true a moment earlier cannot
authorize a second successful purchase after another user has won.

### 3.2 A lock has a durable deadline

The lock deadline is persisted or represented by a durable mechanism. The
application cannot rely only on a browser countdown, process memory, or a
single node staying alive.

### 3.3 Locked tickets are unavailable

While a lock is active for one user, other users cannot purchase or discover the
ticket as available. Direct requests must enforce the same rule as list views.

### 3.4 The checkout amount is stable

A buyer's active order has a price snapshot or equivalent authoritative amount.
A later seller price edit cannot silently change the amount being paid.

### 3.5 Locked price edits are rejected

An owner cannot successfully edit the price while the ticket is locked. If an
edit races with a purchase, the outcome must be deterministic and documented.

### 3.6 Expiration is automatic and recoverable

An unpaid lock expires without an open browser. After expiration, the order is
not payable and the ticket can become available again. A process restart must
not create an infinite lock.

### 3.7 Payment is server-authoritative

The client cannot choose the amount, user, ticket, or order state that the
server charges. Payment is allowed only for the authenticated owner of an
active order and only before expiration.

### 3.8 Terminal outcomes are idempotent

Retries, duplicate browser requests, duplicate payment notifications, repeated
expiration work, and duplicate event deliveries must not create multiple
completed purchases or corrupt ticket/order state.

### 3.9 Private data is isolated

A user cannot read or mutate another user's account, orders, active checkout,
or payment details by changing an identifier or request parameter.

## 4. Architecture design gate

Do not implement the complete workflow until these decisions are documented.
The design session must produce:

1. Service/module boundary diagram.
2. Data ownership table.
3. Request/response interaction map.
4. Ticket, lock, order, and payment state machines.
5. Purchase concurrency decision.
6. Event catalog with payload and version rules.
7. Failure/retry/restart matrix.
8. Authentication boundary decision.
9. Payment boundary decision.
10. Local runtime diagram.
11. AWS deployment diagram.
12. Decision log containing rejected alternatives and reasons.

The design must explain who makes the authoritative lock decision and how the
system prevents a simultaneous price update from changing a checkout amount.

## 5. Modularity questions

Answer these from the product invariants rather than copying a generic
microservices template:

1. What is the smallest useful service/module boundary for the first slice?
2. Which component owns ticket availability and the lock?
3. Which component owns the order lifecycle?
4. Where is the atomic decision made for concurrent Purchase requests?
5. Which operations require an immediate synchronous response?
6. Which state changes may be eventually consistent?
7. Which messages are commands and which are facts?
8. How are event versions, identifiers, and schemas maintained?
9. How are duplicate deliveries detected and made harmless?
10. What happens if a database write succeeds but event publication fails?
11. What happens if event publication succeeds while a consumer is down?
12. How is active lock work recovered after a restart?
13. Which contracts may be shared and which domain code must remain isolated?
14. How does a browser request identify the current user across boundaries?
15. How are internal endpoints protected from public access?

No module may bypass another component's ownership by reading its database
unless that choice is explicitly documented and accepted.

## 6. Persistence requirements

The product requires real databases. Before implementation, decide:

- Database engine.
- Whether each service/module has an independent database or logical area.
- Records and indexes needed for active-lock lookup.
- How expired locks are found without an open browser.
- How price-at-lock is preserved.
- How unique account, order, payment, and idempotency constraints work.
- How schema changes and indexes are applied locally and in AWS.
- Backup, restore, and retention expectations.

Persistence requirements:

- No lock may depend only on in-memory state.
- A restart must recover the state needed for active orders and expiration.
- Money must use an exact representation; floating-point arithmetic must not be
  authoritative for charges.
- Payment records must not contain raw card number, expiration, or security
  code.
- Access to another module's data must go through an agreed contract.

## 7. Event-bus requirements

The product requires a more production-grade event bus than the homemade bus
from the earlier application. Decide the product and protocol before building
consumers.

The event design must define:

- Event envelope and unique event identifier.
- Event name/type and schema version.
- Occurrence timestamp and source.
- Correlation/causation identifiers where needed.
- Delivery guarantee and ordering scope.
- Durable consumer behavior.
- Retry and dead-letter behavior.
- Event retention.
- Schema compatibility rules.
- Observability for published, delivered, retried, and failed events.
- Local single-node behavior versus AWS behavior.

Consumers should be safe under duplicate delivery unless a stronger guarantee
has been deliberately selected and the business invariants are still enforced
at the persistence boundary.

## 8. Authentication requirements

Authentication must be production-grade for the stated email/password flow.
Decide:

- Password hashing algorithm and parameters.
- Session cookies versus bearer tokens.
- Token/session storage and revocation.
- Cookie flags and cross-origin policy.
- Email normalization and account uniqueness.
- Rate limiting and failed-login behavior.
- Secret rotation.
- User identity propagation to other modules.
- Development-only credential behavior.

Required security behavior:

- Never log passwords, raw tokens, signing secrets, or payment data.
- Do not expose whether only an email or only a password was incorrect.
- Protect all listing, order, and payment mutations with authenticated identity.
- Keep local/test credentials separate from AWS credentials.
- Reject malformed or missing identity state consistently.

## 9. Payment requirements

The source calls for Stripe and real payment handling in theory. Use Stripe's
safe test flow until a deliberate production-payment decision exists.

Decide:

- Hosted flow, Elements, or another supported Stripe integration.
- Which server-side Stripe object represents payment.
- How the amount and order state are verified.
- How asynchronous Stripe notifications are received and verified.
- Which signal is authoritative for payment success.
- How failed, cancelled, late, and duplicate attempts behave.
- How test credentials are isolated from AWS credentials.

Required payment behavior:

- The server derives the amount from its authoritative order state.
- Only the order owner can pay.
- Expired orders cannot complete payment.
- A repeated payment attempt cannot create a second completed purchase.
- Raw card details never enter application storage or logs.
- Stripe failure leaves an observable, recoverable state or follows the agreed
  expiration/cancellation path.

## 10. HTTP and contract requirements

Exact route names and response shapes are not defined by the source and remain
design decisions. Whatever contract is selected must provide capabilities for:

- Sign up, sign in, sign out, and current-user state.
- Listing creation, listing reads, and price editing.
- Available-ticket list and ticket detail.
- Purchase intent and current order retrieval.
- My Orders.
- Payment initiation/result handling.
- The selected Stripe notification/callback path.
- Internal health/readiness checks where required by deployment.

HTTP contracts must define:

- Authentication requirement.
- Request validation.
- Success response.
- Expected unavailable/conflict response.
- Authentication/authorization errors.
- Expiration and payment errors.
- Correlation/request identifier behavior.
- Idempotency behavior for mutating retries.

Axios may be used by the browser or by server-side HTTP calls where the chosen
design needs it. It must not become a reason to bypass domain ownership.

## 11. TypeScript and Node workspace requirements

The repository must provide a repeatable command for each independently
runnable application unit selected during the design phase.

Required properties:

- TypeScript source follows a documented Node workflow.
- Express starts HTTP listeners for units that expose HTTP.
- nodemon restarts local development processes after relevant source changes.
- Production startup does not depend on nodemon.
- Configuration comes from runtime environment values, not hard-coded secrets.
- A syntax/type/build check runs without a cloud account.
- Logs go to standard output/error and exclude secrets.
- Shutdown handles termination signals cleanly.

The package-manager choice, workspace layout, compiler execution tool, and
shared-package strategy are design choices.

## 12. Docker requirements

Each selected runnable unit must have a reproducible container definition.

- Dependencies install from a lockfile.
- Build context excludes credentials, local database files, and `node_modules`.
- Development and production startup commands are distinct when needed.
- Configuration is injected at runtime.
- Images expose only required ports.
- Containers can receive termination signals and exit cleanly.
- A unit does not silently depend on files from another unit.
- Image tags used for deployment are immutable or traceable.

Do not introduce shared images or abstractions before repeated setup justifies
them.

## 13. Kubernetes requirements

The local Kubernetes runtime must make the complete core journey runnable.
After the design gate, manifests/templates must describe, as applicable:

- Application workloads.
- Internal service discovery.
- Persistent dependencies selected by the design.
- Configuration values.
- Local-only secrets.
- Readiness and liveness behavior.
- Resource requests and limits when known.
- A browser/API entry point.
- Namespace or equivalent isolation.

A valid manifest is not proof that the application works. The workloads must
start, become ready, and pass the product journey.

## 14. Skaffold requirements

Skaffold must support at least two workflows.

### Local development

1. Build required images.
2. Load or push them according to the local cluster runtime.
3. Apply Kubernetes resources.
4. Stream logs or provide an equivalent development view.
5. Rebuild/redeploy when source changes.
6. Clean up resources when the session ends.

### Image-based deployment

1. Build immutable image tags.
2. Push images to the selected registry.
3. Render deployment configuration with those tags.
4. Apply the selected environment.
5. Report rollout status.

The exact profiles and manifest templating mechanism are design decisions.
Local credentials and AWS credentials must remain separate.

## 15. Required local configuration

Document values for:

- HTTP listen address and port.
- Public API/browser origin.
- Database connections.
- Event-bus connections.
- Authentication secrets/configuration.
- Stripe test credentials and callback configuration.
- Lock duration: fifteen minutes by default, thirty seconds for local manual
  verification.
- Logging level.
- Environment name.

No secret may be committed or printed during startup.

## 16. AWS and Pulumi requirements

The application will be hosted on AWS and infrastructure code will be written
in Python with Pulumi. The AWS topology is intentionally undecided.

Before resource code, decide:

- Compute target for Kubernetes workloads.
- Number of environments.
- Network boundary and availability-zone requirements.
- Persistence products and access model.
- Event-bus hosting model.
- Public ingress and DNS model.
- TLS ownership and renewal.
- Secret storage and workload injection.
- Logs, metrics, alerts, and ownership.
- Backup/restore expectations.
- Monthly cost ceiling and cleanup policy.

Resource categories to map after the design gate:

- Network: VPC, subnets, routes, security groups, and egress.
- Kubernetes: cluster, capacity, identity, and add-ons.
- Images: registry repositories and retention.
- Data: databases, indexes, credentials, backups, and network access.
- Events: bus nodes/storage, access, persistence, and upgrades.
- Public access: load balancing, ingress, DNS, and TLS.
- Secrets: storage, policy, rotation, and injection.
- Observability: logs, metrics, traces if selected, and alerts.
- Billing: tags, budgets, and teardown.

Pulumi requirements:

- Stack configuration identifies the environment.
- Secret values use Pulumi secret configuration or the selected AWS mechanism.
- Outputs expose only values needed for deployment wiring.
- Resource names include project and environment.
- Tags identify owner, environment, and teardown intent.
- Preview runs before apply.
- Apply and destroy procedures are documented.
- State storage and access are deliberate.
- No resource is added without a corresponding decision and verification step.

Environment progression:

1. Prove the functional slice locally before introducing cloud cost.
2. Deploy the smallest AWS development environment that can run the journey.
3. Add production-shaped availability, scaling, backups, key rotation, network
   isolation, and alerting only when requirements or failure evidence justify it.

AWS safety:

- Never commit AWS keys, Stripe secrets, database passwords, or signing secrets.
- Separate local, development, and production-shaped credentials.
- Do not expose internal dependencies directly to the public internet.
- Use Stripe test credentials until production payment is explicitly approved.
- Add budget and cleanup controls before creating paid resources.
- Do not claim high availability without deployed topology and a failure check.

## 17. Implementation roadmap

### Phase 0 — Freeze requirements

- Review this file and `product-requirements.md`.
- Confirm included features and non-goals.
- Confirm fifteen-minute default and thirty-second local duration.
- Confirm product terms and observable race results.

Exit: the same Purchase, expiration, and payment behavior is understood by
every contributor.

### Phase 1 — Establish the workspace

- Configure TypeScript and the package manager.
- Establish the workspace layout.
- Add Express to the first HTTP process.
- Add nodemon.
- Add Axios where the first selected HTTP interaction needs it.
- Add environment configuration.
- Add a minimal request path.
- Package it with Docker.
- Add a focused syntax/type/build command.

Exit: it starts locally, responds through HTTP, restarts with nodemon, and runs
from Docker without repository secrets.

### Phase 2 — Complete the architecture design gate

Produce the boundary diagram, ownership table, state machines, interaction map,
event catalog, failure matrix, local diagram, AWS diagram, and decision log.
Do not implement the complete workflow before this phase is complete.

Exit: the lock authority, price-race outcome, and failure behavior are explicit.

### Phase 3 — Add persistence and event infrastructure

- Add selected local database runtime.
- Add selected local event-bus runtime.
- Define connection failure behavior.
- Define persistence initialization, migrations, and indexes.
- Define event envelope/version handling.
- Add selected retry and duplicate-processing behavior.
- Add local Kubernetes resources.
- Add Skaffold wiring.

Exit: restart preserves records, a sample event is delivered, and duplicate
delivery does not corrupt state.

### Phase 4 — Implement authentication

- Account creation and validation.
- Secure password handling.
- Sign-in and sign-out.
- Current-user identity.
- Public/protected access checks.
- Safe configuration and errors.
- Header state needed by the eventual client.

Exit: two accounts work independently, invalid credentials fail, sign-out
removes access, and credentials are absent from logs.

### Phase 5 — Implement listings

- Create the minimum agreed listing.
- Associate it with the owner.
- Display available listings.
- Read detail.
- Edit price while available.
- Reject unauthorized edits.
- Add only the events selected in the design.
- Record the state needed for lock and final sale.

Exit: user A can create/edit, user B can discover, and unavailable states are
clear.

### Phase 6 — Implement Purchase and order creation

- Authenticate the buyer.
- Validate ticket availability.
- Apply the chosen atomic/concurrency decision.
- Create purchase intent/order state.
- Capture lock deadline and price snapshot.
- Expose the order to its owner.
- Hide the locked ticket from other available reads.
- Handle duplicate requests and losing concurrent requests.

Exit: exactly one of two near-simultaneous buyers wins, the winner sees a
countdown/order, the loser cannot pay, and the seller cannot edit the lock.

### Phase 7 — Implement expiration

- Persist the deadline.
- Add the selected durable scheduling/claim mechanism.
- Expire unpaid orders.
- Release tickets.
- Process the selected expiration event/command.
- Make work safe to retry.
- Reject late payment.
- Recover after restart.

Exit: a thirty-second local lock expires without a browser, the ticket returns
to availability, and simultaneous expiration/payment has one terminal result.

### Phase 8 — Add Stripe payment

- Configure local Stripe test credentials.
- Implement the selected safe payment UI.
- Validate order, user, lock, and amount server-side.
- Create/confirm the selected Stripe object.
- Record outcome without raw card data.
- Make completed orders/tickets terminal.
- Handle failed, repeated, and late payment.
- Add verified callback/webhook handling if selected.

Exit: one safe test payment completes one active order and cannot be repeated.

### Phase 9 — Build the browser journey

Implement the source mockup flow:

- Public landing page.
- Sign-up and sign-in.
- Authenticated header and sign-out.
- Listing creation and edit.
- Listing detail.
- Locked checkout/countdown.
- Stripe-safe payment screen/modal.
- My Orders.
- Unavailable, expired, failed-payment, and unauthorized states.

Exit: the manual product journey works in two browser sessions, and refresh
does not lose server-owned state.

### Phase 10 — Complete local delivery

- Containerize selected runnable units.
- Add Kubernetes resources.
- Add local configuration and non-production secrets.
- Add readiness/liveness behavior.
- Add the local Skaffold profile.
- Verify rebuild/redeploy, logs, teardown, and restart.
- Document exact local commands.

Exit: a new checkout can run the complete local journey and restart preserves
product state.

### Phase 11 — Prepare Pulumi Python infrastructure

- Create Pulumi project and stack configuration.
- Record the design decisions encoded by the stack.
- Implement selected network and compute resources.
- Implement registry access.
- Implement selected persistence and event dependencies.
- Implement secret access.
- Implement ingress, DNS, and TLS as selected.
- Add tags, outputs, preview, apply, destroy, cost, and cleanup instructions.

Exit: preview shows intended changes and no secrets appear in source or output.

### Phase 12 — Deploy AWS development

- Apply the Pulumi development stack.
- Build and publish immutable images.
- Deploy through the selected Skaffold/cloud workflow.
- Confirm readiness and startup logs.
- Configure public endpoint and Stripe test callback.
- Run the cloud smoke journey.
- Verify lock/expiration after restart.
- Record costs and limitations.
- Tear down if the environment should not remain active.

Exit: the cloud environment completes the same observable product journey as
local.

### Phase 13 — Harden concurrency and failure behavior

Exercise:

- Two buyers for one ticket.
- Purchase versus seller price edit.
- Expiration versus payment.
- Client retry of Purchase.
- Client retry of payment.
- Interrupted database write.
- Delayed event publication/delivery.
- Duplicate event delivery.
- Restart with an active lock.
- Unavailable dependency during a request.

For each case record the invariant, response, persisted terminal state,
recovery behavior, and focused smoke-check evidence.

Exit: no plausible interleaving sells one ticket twice, no expired order pays,
and active locks do not depend only on memory.

### Phase 14 — Release readiness

Before a production-shaped environment:

- Every product requirement has acceptance evidence.
- The decision log matches the implementation.
- API/event contracts are versioned and documented.
- Credentials are separated by environment.
- Card data and secrets are absent from logs/persistence.
- Backup and restoration ownership is explicit.
- Rollback and teardown work.
- Cost controls exist.
- Monitoring reveals dependency, payment, and expiration failures.
- The AWS environment has an owner and cleanup plan.

Running containers alone is not release readiness. Lock, expiration, payment,
and concurrency invariants are the release gate.

## 18. Required verification

Use focused checks rather than claiming success from configuration alone:

- TypeScript syntax/type/build check.
- Container start check.
- Kubernetes readiness check.
- Skaffold local redeploy check.
- Manual two-user lock race.
- Manual thirty-second expiration journey.
- Manual safe Stripe test payment.
- Restart/recovery journey.
- AWS smoke journey after Pulumi deployment.

A valid manifest is not proof of a working application. A successful Pulumi
preview is not proof of a working AWS deployment.
