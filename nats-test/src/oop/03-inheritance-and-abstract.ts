/**
 * ============================================================================
 * 03: INHERITANCE & ABSTRACT CLASSES IN TYPESCRIPT
 * ============================================================================
 *
 * PYTHON COMPARISON:
 * In Python:
 *   from abc import ABC, abstractmethod
 *
 *   class BasePublisher(ABC):
 *       def __init__(self, channel: str):
 *           self.channel = channel
 *
 *       @abstractmethod
 *       def publish(self, message: str) -> None:
 *           pass
 *
 *   class TicketPublisher(BasePublisher):
 *       def __init__(self):
 *           super().__init__("tickets")
 *
 *       def publish(self, message: str) -> None:
 *           print(f"Publishing {message} to {self.channel}")
 *
 * In TypeScript:
 *   - `abstract class` replaces `class Base(ABC)`.
 *   - `abstract method(): type;` replaces `@abstractmethod def method(self): pass`.
 *   - An abstract class CANNOT be instantiated directly via `new Base()`.
 *   - Subclasses use `extends` keyword and must implement all abstract members.
 *   - `super(...)` MUST be called before accessing `this`.
 */

// ---------------------------------------------------------------------------
// 1. Abstract Base Class
// ---------------------------------------------------------------------------
export abstract class BasePublisher {
 // Abstract property: every subclass MUST provide a concrete value
 abstract readonly subject: string;

 // Concrete property shared by all subclasses
 protected channelPrefix = "events";

 constructor(protected clusterId: string) {}

 // Abstract method: every subclass MUST provide an implementation
 abstract publish(payload: Record<string, unknown>): Promise<void>;

 // Concrete helper method available to all subclasses
 getFullSubject(): string {
  return `${this.channelPrefix}.${this.subject}`;
 }
}

// ---------------------------------------------------------------------------
// 2. Concrete Derived Class
// ---------------------------------------------------------------------------
export class ConcreteTicketPublisher extends BasePublisher {
 // Implementing the abstract property
 readonly subject = "ticket:created";

 constructor(clusterId: string) {
  // ⚠️ WHY MUST `super()` BE CALLED FIRST?
  // In JavaScript/TypeScript, derived classes do not allocate `this` on their own.
  // Calling `super(...)` executes the base constructor, which initializes the object
  // prototype and binds `this`. Attempting to access `this` before `super()` throws
  // a runtime ReferenceError.
  super(clusterId);
 }

 // Implementing the abstract method.
 // The `override` keyword ensures that if the base method changes or is removed,
 // the compiler immediately flags an error instead of silently creating a detached method.
 override async publish(payload: Record<string, unknown>): Promise<void> {
  const fullTopic = this.getFullSubject();
  // Simulated publish logic
  void fullTopic;
  void payload;
 }
}
