# System Design Journal

**Status:** In progress — guided by questions, with decisions made by the learner.

## Working method

- Complete one journey at a time.
- Record decisions only after reasoning through them.
- Use questions and nudges rather than supplied answers.
- Keep ownership consistent with `../service-boundary.md`.
- Do not define events until the journeys and state transitions are clear.

## Step 1 — Business journeys

Describe each journey in plain business language before discussing services,
transport, persistence, or implementation.

| Journey | Worksheet | Status |
|---|---|---|
| Identity access | `journies/identity-access.md` | Not started |
| Ticket discovery | `journies/ticket-discovery.md` | Not started |
| Ticket management | `journies/ticket-management.md` | Not started |
| Ticket purchase | `journies/ticket-purchase.md` | Not started |
| Payment | `journies/payment.md` | Not started |
| Expiration | `journies/expiration.md` | Not started |
| Order history | `journies/order-history.md` | Not started |
| User reporting and moderation | `journies/user-reporting-and-moderation.md` | First vertical slice implemented |

## Current stopping point

Most journeys still need their design stages completed. User reporting and
moderation is the current exception: its first buyer-to-seller reporting slice
has accepted API, communication, persistence, and UI contracts.

## Roadmap after the journeys

Each completed stage produces one small design document. Do not create the next
document until the current stage is complete.

### Step 2 — `invariants.md`

Record the business truths that must never be violated. Group them by journey
and assign one authoritative owner to each rule.

Completion question: could a retry, race, or failure break any unrecorded rule?

### Step 3 — `State Machines/`

Record the states discovered during the journeys, their allowed transitions,
the conditions for each transition, and which states are terminal.
Use the question-led worksheets in that folder to formalize each journey without
inventing state for read-only behavior.

Completion question: is every successful, rejected, and abandoned journey
represented by a valid transition or deliberate non-transition?

### Step 4 — `interaction_flows.md`

Trace each journey in chronological steps. Record the actor, requested decision,
decision owner, state changed, required response, and important failure points.
Do not choose transport yet.

Completion question: does every step have one owner and an observable outcome?

### Step 5 — `communication.md`

Classify each interaction as a request for work or a committed fact. Then decide
which interactions require an immediate response and which may happen
asynchronously.

Completion question: is each communication choice justified by behavior rather
than by the available technology?

### Step 6 — `events.md`

Define the event contracts discovered from committed state transitions. Record
ownership, trigger, minimum payload, consumers, duplicate behavior, out-of-order
behavior, and versioning. Event names come after the facts are understood.

Completion question: can every consumer safely receive the same fact more than
once or after a newer fact?

### Step 7 — `api_contracts.md`

Define public and internal operations, inputs, outputs, authorization, business
errors, and idempotency expectations.

Completion question: can a caller distinguish success, rejection, temporary
failure, and an unknown result?

### Step 8 — `data_and_consistency.md`

Record service-owned records, database constraints, transaction boundaries,
cross-service references, recovery rules, and durable delayed work.

Completion question: does persistence enforce the important invariants during
concurrency and process failure?

### Step 9 — `sequence_diagrams.md`

Draw the successful flow and the important failure or race flows. The diagrams
must agree with the earlier ownership and communication decisions.

Completion question: does each message, decision, and state change have a clear
order and owner?

### Step 10 — `implementation_plan.md`

Break the design into the smallest runnable vertical slices. Give each slice one
observable manual check before adding the next.

Completion question: does every slice prove real behavior rather than only
creating structure?

## Immediate next step after journeys

Create `invariants.md` and work through one completed journey at a time. Start by
asking what must remain true even when requests are repeated, concurrent, late,
or interrupted.
