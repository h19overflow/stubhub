# State Machine Worksheets — Step 3

**Status:** Worked examples completed.

The journey documents already identified successful, rejected, failed, and
abandoned outcomes. State-machine design formalizes those outcomes by recording
which authoritative business state changes, which conditions permit the change,
and which outcomes deliberately make no state change.

## Working rule

Design one state machine for one authoritative business entity. Do not make a
single diagram that combines Identity, Tickets, Orders, the browser, and the
payment provider.

A journey may:

1. change one state machine;
2. coordinate transitions in two independently owned state machines; or
3. be read-only and require no new state machine.

The third answer is valid. Do not invent states for pages, buttons, filters,
loading indicators, or temporary error messages.

## How to structure the design

Work in this order:

1. Name the business entity being modeled.
2. Assign its one authoritative owner.
3. Copy the relevant invariant IDs from `../invariants.md`.
4. List the smallest set of states that change allowed behavior.
5. Identify the initial state and terminal states.
6. Separate state from ordinary data such as `expiresAt`, price, or owner.
7. Record every allowed transition in a table.
8. Record rejected actions as guarded non-transitions.
9. Decide retry behavior for every transition.
10. Test races, late results, interruption, and restart recovery.

## State test

A proposed state deserves to exist when it changes what the entity is allowed to
do. Ask:

- Does this value permit or forbid an action?
- Does it change which later transitions are legal?
- Must it survive a browser close or process restart?
- Is it mutually exclusive with the other states?

If the answer is no, it is probably data, presentation, or an error response—not
a business state.

Examples of data rather than states:

- reservation deadline;
- captured price;
- owner identifier;
- payment-provider reference;
- remaining seconds shown by the browser.

Examples of outcomes that are usually non-transitions:

- invalid input;
- unauthorized request;
- stale page;
- temporary service failure;
- retry that returns an already-recorded result.

## Machine worksheet

```text
Machine name:

Business entity:

Authoritative owner:

Invariant IDs enforced:

Initial state:

Active states:

Terminal states:

State data that is not itself a state:
```

## Transition worksheet

| From | Triggering business action or condition | Guard that must still be true | To | Data changed | User-visible outcome | Retry behavior |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

For every row, ask:

- Is the guard checked by the authoritative owner?
- Is the state change one indivisible decision inside that owner?
- What happens if the trigger is received twice?
- What happens if another valid transition races with it?
- What does a caller observe if the result is unknown?

## Rejected-transition worksheet

| Attempted action | Current state or failed guard | Required outcome | State that must remain unchanged |
|---|---|---|---|
|  |  |  |  |

Rejection is usually not a `failed` state. Record a failure state only when the
failure changes what later actions are allowed.

## Cross-machine worksheet

Use this only when one journey coordinates separately owned machines.

```text
First authoritative decision:

Second authoritative decision:

Valid combined business outcome:

Partial failure after the first decision:

Recovery owner:

Safe retry result:
```

Do not hide partial failure by drawing one arrow across two services. Each owner
changes only its own state; coordination and recovery are separate obligations.

## Completion check

A machine is ready when:

- every successful journey outcome has an allowed transition;
- every rejection has a guard and deliberate non-transition;
- every abandoned journey has an expiration or recovery outcome;
- every invariant maps to a state, guard, terminal rule, or retry rule;
- every race has one deterministic winner;
- every retry has one deterministic result;
- uncertain results are not silently treated as failures;
- terminal states reject conflicting later transitions; and
- state and deadlines survive browser closure and process restart.

Use the journey-specific worksheets in this folder before drawing diagrams. The
diagram should be the final rendering of the completed transition table, not the
place where the rules are invented.
