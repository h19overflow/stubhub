# Goal: Independent Mid-Level Service Design

## Purpose

Turn good service-boundary instincts into an independent, repeatable design
process. This goal was captured after the user-reporting and moderation design
exercise.

Current assessment from that exercise:

> Strong junior moving into mid-level backend/system design. Ownership and data
> currency instincts are early-mid-level; independent failure and recovery design
> is still developing.

This is not a permanent level label. Each gap below has an observable exit signal
so progress can be demonstrated rather than guessed.

## Status legend

- **DEMONSTRATED** — reasoned correctly without being given the answer.
- **DEVELOPING** — reached the correct result through structured questions.
- **NOT YET INDEPENDENT** — important questions were supplied rather than
  generated unaided.
- **PRACTICE PENDING** — understood conceptually but has not yet produced and
  defended a complete design using it.

## Strengths to preserve

| Capability | Status | Evidence from the moderation exercise |
|---|---|---|
| Distinguish business ownership from storage location | DEMONSTRATED | Correctly identified the report reason as Moderation-owned while Ticket facts remain Tickets-owned |
| Classify external identifiers | DEMONSTRATED | Classified `orderId` as an external Orders reference rather than Moderation-owned data |
| Distinguish snapshots from current truth | DEMONSTRATED | Classified `orderStatusAtReport` as historical evidence and current email as Identity-owned current data |
| Prefer immutable historical evidence | DEMONSTRATED | Selected the immutable Ticket snapshot captured with the Order instead of the current editable listing |
| Remove unnecessary read-time dependencies | DEMONSTRATED | Concluded that the evidence page can read from Moderation after bounded evidence capture |
| Reject broad database exposure | DEMONSTRATED | Rejected the need for a list-all-users operation or a copy of the complete Identity database |
| Avoid irrelevant live reads | DEMONSTRATED | Chose not to fetch current Ticket state when no moderation decision depends on it |
| Revise an incorrect boundary cleanly | DEMONSTRATED | Separated Moderation Case states from User account state and clarified that `common` is a package rather than a business owner |

## Growth-gap matrix

| Capability | Current status | Gap to surface during later designs | Observable exit signal |
|---|---|---|---|
| Start from invariants rather than routes or events | DEVELOPING | Initial design moved quickly toward pages, routes, and event labels before every business rule and owner was explicit | For a new feature, write the invariant list and decision owners before naming any API path, event, queue, or database table |
| Separate state machines by business entity | DEVELOPING | Report workflow state was initially placed on the User instead of a Report or Moderation Case | Independently identify every stateful entity and produce separate transition tables without combining case, user, order, or ticket state |
| Separate shared mechanics from business policy | DEVELOPING | `common` was initially considered a place for canonical role-to-authority policy | Keep shared code generic and place each authorization decision with the service that owns the protected action |
| Generate all external data classifications unaided | PRACTICE PENDING | Reference, snapshot, current value, and projection were classified correctly after the categories were supplied | Build a complete page/API field ledger and classify every field using FACTS without prompts |
| Distinguish rejection, temporary failure, and unknown outcome | NOT YET INDEPENDENT | These failure classes were introduced by guidance rather than generated automatically | Every state-changing interaction explicitly defines all three outcomes and proves that none is silently treated as another |
| Design idempotency before retries | NOT YET INDEPENDENT | Stable request identity, fingerprint conflicts, and replay behavior were not raised independently | For each retryable command, define scope, stable identity, fingerprint, replay result, and conflicting-reuse behavior before choosing transport |
| Surface commit/response failure windows | NOT YET INDEPENDENT | Lost responses after a possible commit were not initially considered | For every remote mutation, identify the before-commit, after-commit-before-response, caller-retry, and restart recovery outcomes |
| Design duplicate asynchronous delivery | NOT YET INDEPENDENT | Duplicate suppression and commit-before-ACK behavior required prompting | Every proposed consumer defines stable message identity, atomic business effect plus processed-event record, and duplicate replay result |
| Design late and out-of-order delivery | NOT YET INDEPENDENT | Current-state guards and entity ordering were not generated initially | Each fact contract names its ordering entity and shows one older fact arriving after newer state without violating an invariant |
| Assign one recovery owner after partial cross-service success | NOT YET INDEPENDENT | Cross-owner cancellation and ban enforcement required guided decomposition | Every multi-owner flow states which durable record survives partial success, which service retries, and what definitive result ends recovery |
| Protect unresolved in-flight work | DEVELOPING | Payment-processing protection was understood after the edge case was presented | Independently identify work that cannot be cancelled, expired, released, or replaced while its result is unknown |
| Model security propagation delay | NOT YET INDEPENDENT | Stale JWT role/ban claims, refresh-family revocation, and local enforcement lag were not surfaced initially | Specify the maximum stale-authorization window and behavior of access JWTs, refresh sessions, and local projections for each security transition |
| Plan compatibility and rollout | NOT YET INDEPENDENT | Mixed-version producers, consumers, tokens, and schemas were outside the initial reasoning | Design a deploy order where old and new instances coexist safely, including additive contracts, version handling, and rollback behavior |
| Define operational evidence | NOT YET INDEPENDENT | Logs, metrics, reconciliation queries, and stuck-work detection were not part of the first design | Every durable flow names the state, metric, or query proving healthy completion and detecting permanently stuck work |
| Produce a complete specification without prompts | PRACTICE PENDING | Correct answers were consistent once the question sequence was provided | Independently produce boundaries, field ledger, communication cards, failure matrix, state tables, and final sequence diagram, then defend each tradeoff |

## Required design loop

Use this loop for the next substantial feature.

1. **Write the business journeys.** Include success, rejection, abandonment, and
   user-visible failure.
2. **Write the invariants.** State what must remain true during retries, races,
   delays, and process failure.
3. **Name stateful entities.** Give each entity its own lifecycle and one owner.
4. **Classify every cross-boundary field with FACTS.** Record function,
   authority, currency, timing, and safety.
5. **Write one communication card per interaction.** Do not name transport yet.
6. **Generate the failure matrix unaided.** Include rejection, temporary failure,
   unknown outcome, duplicate, late, reordered, dependency outage, and restart.
7. **Choose transport.** Immediate decision, committed fact, internal durable
   work, external reference, snapshot, or projection.
8. **Define retry and recovery identity.** State who retries and what proves the
   original logical outcome.
9. **Draw the sequence diagram last.** It renders accepted decisions rather than
   inventing contracts.
10. **Name runtime evidence.** State how logs, metrics, database rows, or broker
    state prove completion and expose stuck work.

Bottom-up curriculum:
[`Durable Service Design from First Principles`](../service-design/index.md).
Use it one lesson at a time before applying this loop to a new feature.

Reusable guide:
[`service_communication_design_guide.md`](../system_design/service_communication_design_guide.md).

Current worked specification:
[`moderation_service_communication.md`](../system_design/moderation_service_communication.md).

## Independent review checklist

Before asking for guidance, answer each question in writing:

- [ ] What exact business decision or page field forces this interaction?
- [ ] Which service owns the authoritative truth?
- [ ] Is each value local data, an external reference, a snapshot, current truth,
      or a projection?
- [ ] Must the answer be immediate, or may another service converge later?
- [ ] What is a definitive business rejection?
- [ ] What is a temporary failure?
- [ ] Could the owner commit before the response is lost?
- [ ] What stable identity makes retry safe?
- [ ] What happens on duplicate delivery?
- [ ] What happens when an older fact arrives late?
- [ ] Which current-state guard prevents stale work from mutating newer state?
- [ ] Which service owns recovery after partial success?
- [ ] What happens during process, broker, and dependency restart?
- [ ] How long may authorization data remain stale?
- [ ] How do mixed application versions coexist during rollout?
- [ ] What runtime evidence proves the flow completed?

## Solid mid-level exit gate

Do not mark this goal complete because a guided answer was correct. Complete it
when one new cross-service feature is designed independently and review confirms:

- every business entity and decision has one owner;
- every cross-service field has a correct currency classification;
- every interaction has an explicit communication card;
- rejection, temporary failure, and unknown outcome remain distinct;
- state-changing retries preserve one logical operation;
- duplicate and out-of-order delivery are safe;
- partial success has one durable recovery owner;
- in-flight unknown work is protected;
- security staleness and rollout behavior are stated;
- runtime completion and stuck-work evidence are named; and
- the final sequence diagram introduces no new decision or contract.

## Senior-direction gaps after the mid-level gate

After the independent mid-level gate is demonstrated, continue with:

- cross-team contract evolution and deprecation;
- zero-downtime schema and event migration;
- capacity limits, backpressure, and overload behavior;
- operational ownership, alerts, dashboards, and incident response;
- privacy, retention, audit, and regulatory constraints;
- cost and complexity tradeoffs across multiple viable architectures; and
- teaching and reviewing another engineer's design without supplying all of the
  answers.
