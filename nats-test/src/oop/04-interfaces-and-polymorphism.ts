/**
 * ============================================================================
 * 04: INTERFACES & STRUCTURAL POLYMORPHISM IN TYPESCRIPT
 * ============================================================================
 *
 * PYTHON COMPARISON:
 * In Python:
 *   - Duck typing is dynamic at runtime: "If it walks like a duck, it's a duck."
 *   - Python 3.8+ introduced `typing.Protocol` for structural typing.
 *
 * In TypeScript:
 *   - Structural typing is the DEFAULT for the entire language.
 *   - An `interface` defines a compile-time shape.
 *   - CRITICAL DIFFERENCE: Interfaces are completely erased at compile time!
 *     They produce 0 bytes of JavaScript.
 *   - Unlike abstract classes, interfaces cannot have constructors, default state,
 *     or implemented methods.
 */

// ---------------------------------------------------------------------------
// 1. Defining Interfaces (Contracts)
// ---------------------------------------------------------------------------
export interface MessageHandler {
 handle(rawMessage: string): Promise<boolean>;
}

export interface HealthCheckable {
 isHealthy(): boolean;
}

// ---------------------------------------------------------------------------
// 2. Implementing Interfaces (`implements`)
// ---------------------------------------------------------------------------
// A class can implement MULTIPLE interfaces (unlike inheritance where you can
// only `extend` a single class).
export class TicketEventHandler implements MessageHandler, HealthCheckable {
 private healthy = true;

 async handle(rawMessage: string): Promise<boolean> {
  try {
   JSON.parse(rawMessage);
   return true;
  } catch {
   return false;
  }
 }

 isHealthy(): boolean {
  return this.healthy;
 }
}

export class OrderEventHandler implements MessageHandler, HealthCheckable {
 async handle(rawMessage: string): Promise<boolean> {
  return rawMessage.length > 0;
 }

 isHealthy(): boolean {
  return true;
 }
}

// ---------------------------------------------------------------------------
// 3. Polymorphism: Programming to Interfaces, Not Implementations
// ---------------------------------------------------------------------------
// This function doesn't care whether the handler is for Tickets or Orders.
// As long as it satisfies `MessageHandler`, it accepts it.
export async function processBatch(
 handlers: MessageHandler[],
 message: string,
): Promise<boolean[]> {
 return Promise.all(handlers.map((h) => h.handle(message)));
}

// ---------------------------------------------------------------------------
// 4. Structural Typing in Action ("Compile-time Duck Typing")
// ---------------------------------------------------------------------------
// Notice this plain object did NOT use `class` or `implements MessageHandler`.
// Yet TypeScript accepts it because its SHAPE matches `MessageHandler`!
export const adHocHandler: MessageHandler = {
 async handle(rawMessage: string): Promise<boolean> {
  return rawMessage.startsWith("{");
 },
};
