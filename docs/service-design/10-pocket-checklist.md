# 10. Durable Service-Design Pocket Checklist

Use this order every time:

```text
JOURNEY
  -> RULES
  -> OWNERS
  -> FACTS
  -> FAILURES
  -> RECOVERY
  -> TRANSPORT
  -> PROOF
  -> DRAW
```

## 1. Journey

- What does the user or system actor try to accomplish?
- What are success, rejection, abandonment, and visible failure?

## 2. Rules

- What must remain true during races, retries, delays, and restarts?
- Which in-flight work must be protected while its result is unknown?

## 3. Owners

- What are the separate stateful entities?
- What is each entity's state machine?
- Which one service owns each decision and database?

## 4. FACTS

For every cross-boundary value or interaction:

- **Function:** what exact decision or visible field requires it?
- **Authority:** who owns the truth?
- **Currency:** local, reference, snapshot, current truth, or projection?
- **Timing:** immediate answer or later convergence?
- **Safety:** what happens under failure, retry, duplicate, and stale delivery?

## 5. Failures

Write all outcomes explicitly:

- business rejection;
- temporary failure;
- unknown outcome after possible commit;
- duplicate;
- late or reordered work;
- dependency outage;
- process or broker restart; and
- partial cross-service success.

## 6. Recovery

- What stable identity represents one logical operation or fact?
- What durable record survives each commit window?
- Who retries?
- How is duplicate application prevented atomically?
- Which current-state or version guard rejects stale work?
- What definitive result ends recovery?

## 7. Transport

Only now choose among:

- local call;
- immediate HTTP or RPC decision;
- internal durable job;
- asynchronous committed fact;
- external reference;
- historical snapshot; or
- local projection.

Then choose a specific broker or protocol whose behavior fits the accepted
requirements.

## 8. Proof

- Which row, metric, log field, broker state, or reconciliation query proves
  completion?
- What age or count reveals stuck work?
- How stale may authorization remain?
- How do old and new versions coexist and roll back safely?

## 9. Draw

Draw the sequence diagram last. Reject any diagram that introduces a decision,
field, retry, event, or recovery rule not already accepted.

## Three anti-rush questions

When you feel yourself jumping to routes or events, ask aloud:

1. What must never become false?
2. Who alone decides whether this state may change?
3. If the process dies at this exact line, what durable evidence survives and
   who resumes?

If any answer is vague, return to the earlier step. Do not compensate by adding
more infrastructure.