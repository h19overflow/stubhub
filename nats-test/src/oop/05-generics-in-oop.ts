/**
 * ============================================================================
 * 05: GENERICS IN OBJECT-ORIENTED TYPESCRIPT
 * ============================================================================
 *
 * PYTHON COMPARISON:
 * In Python (3.12+):
 *   class Repository[T]:
 *       def __init__(self):
 *           self._items: list[T] = []
 *
 * In Python (older typing module):
 *   from typing import Generic, TypeVar
 *   T = TypeVar("T", bound=BaseEvent)
 *   class Listener(Generic[T]): ...
 *
 * In TypeScript:
 *   - Generics are written with angle brackets: `class Repository<T>`.
 *   - Constraints use `extends`: `<T extends BaseEvent>` (Python's `bound=BaseEvent`).
 *   - This allows classes to enforce strong typing for payloads without duplicating logic.
 *   - Notice: this is the EXACT pattern used in our `Listener<T extends Event>`!
 */

export interface DomainEvent {
 topic: string;
 payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 1. Generic Class with Type Constraint (`<T extends DomainEvent>`)
// ---------------------------------------------------------------------------
// The constraint `extends DomainEvent` guarantees that `T` has `topic` and `payload`.
export abstract class GenericEventProcessor<T extends DomainEvent> {
 constructor(protected serviceName: string) {}

 // The method receives the exact strongly-typed payload defined by T['payload']
 abstract process(topic: T["topic"], payload: T["payload"]): Promise<void>;

 // Helper method shared across all generic instances
 async logAndProcess(event: T): Promise<void> {
  await this.process(event.topic, event.payload);
 }
}

// ---------------------------------------------------------------------------
// 2. Concrete Implementation with Specific Type Argument
// ---------------------------------------------------------------------------
export interface TicketCancelledEvent {
 topic: "ticket:cancelled";
 payload: {
  ticketId: string;
  reason: string;
  refundAmount: number;
 };
}

// Subclass binds `T` to `TicketCancelledEvent`
export class TicketCancellationProcessor extends GenericEventProcessor<TicketCancelledEvent> {
 // TypeScript automatically knows that `topic` is `'ticket:cancelled'`
 // and `payload` has `{ ticketId, reason, refundAmount }`!
 async process(
  topic: "ticket:cancelled",
  payload: { ticketId: string; reason: string; refundAmount: number },
 ): Promise<void> {
  // If you misspell a field, TypeScript catches it immediately!
  void topic;
  void payload.ticketId;
 }
}
