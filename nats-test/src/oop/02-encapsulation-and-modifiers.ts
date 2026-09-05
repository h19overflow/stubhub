/**
 * ============================================================================
 * 02: ENCAPSULATION & ACCESS MODIFIERS IN TYPESCRIPT
 * ============================================================================
 *
 * PYTHON COMPARISON:
 * In Python, all attributes are technically public.
 *   - `self._field` is a CONVENTION ("please treat as protected").
 *   - `self.__field` is NAME MANGLING (renamed to `_ClassName__field`), still accessible!
 *
 * In TypeScript, there are two distinct layers of encapsulation:
 *   1. Compile-time modifiers (`public`, `protected`, `private`):
 *      Enforced strictly by the TypeScript compiler.
 *   2. Runtime private fields (`#field` - ECMAScript standard):
 *      Hard private enforced by the JavaScript V8 runtime.
 */

// ---------------------------------------------------------------------------
// 1. Compile-Time Access Modifiers
// ---------------------------------------------------------------------------
export class EventConsumer {
 // `public`: accessible from anywhere (default if omitted)
 public queueGroup: string;

 // `protected`: accessible within this class AND derived subclasses
 // (Notice: this is exactly how `protected client` and `protected ackWait` work in base-listener.ts!)
 protected retryCount = 0;

 // `private`: accessible ONLY within this exact class
 private secretApiKey: string;

 // `readonly`: once set in constructor, cannot be reassigned (like Python Final)
 public readonly streamId: string;

 constructor(queueGroup: string, secretApiKey: string, streamId: string) {
  this.queueGroup = queueGroup;
  this.secretApiKey = secretApiKey;
  this.streamId = streamId;
 }

 // Public method calling private method
 public connect(): boolean {
  return this.validateKey(this.secretApiKey);
 }

 // Private helper method (cannot be called from outside or subclasses)
 private validateKey(key: string): boolean {
  return key.length >= 8;
 }
}

export class OrderConsumer extends EventConsumer {
 public attemptRetry(): void {
  // ✅ ALLOWED: `retryCount` is protected, so subclasses can read/write it
  this.retryCount += 1;

  // ❌ COMPILE ERROR if uncommented:
  // Property 'secretApiKey' is private and only accessible within class 'EventConsumer'.
  // console.log(this.secretApiKey);
 }
}

// ---------------------------------------------------------------------------
// 2. JavaScript Hard Private Fields (`#fieldName`)
// ---------------------------------------------------------------------------
// While `private` is checked at compile time, `#field` is enforced at RUNTIME
// by JavaScript itself. Not even `(consumer as any).#field` can read it.
export class SecureVault {
 // ECMAScript runtime private field
 #encryptionKey: string;

 constructor(initialKey: string) {
  this.#encryptionKey = initialKey;
 }

 verifyKey(candidate: string): boolean {
  // Only accessible inside this class syntax body
  return this.#encryptionKey === candidate;
 }
}
