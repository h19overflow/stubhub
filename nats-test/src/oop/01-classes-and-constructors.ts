/**
 * ============================================================================
 * 01: CLASSES, CONSTRUCTORS & PROPERTIES IN TYPESCRIPT
 * ============================================================================
 *
 * PYTHON COMPARISON:
 * In Python:
 *   class Ticket:
 *       # Class attribute
 *       default_currency = "USD"
 *
 *       def __init__(self, title: str, price: float):
 *           self.title = title       # Instance attribute
 *           self._price = price
 *
 *       @property
 *       def price(self) -> float:
 *           return self._price
 *
 * In TypeScript:
 *   - `constructor(...)` is the exact equivalent of `__init__(self, ...)`.
 *   - `this` is the exact equivalent of `self`.
 *   - Fields must be declared on the class body (or via parameter properties).
 *   - Getters/setters use `get` and `set` keywords (Python's `@property`).
 */

// ---------------------------------------------------------------------------
// 1. Standard Class Syntax
// ---------------------------------------------------------------------------
export class StandardTicket {
 // Class property declarations (defines shape and initial values)
 title: string;
 price: number;

 // Constructor: Python's __init__
 constructor(title: string, price: number) {
  this.title = title;
  this.price = price;
 }

 // Method: notice NO `function` keyword, NO `self` parameter
 formatPrice(): string {
  return `$${this.price.toFixed(2)}`;
 }
}

// ---------------------------------------------------------------------------
// 2. Parameter Properties Shorthand (TypeScript Superpower!)
// ---------------------------------------------------------------------------
// In Python, you write:
//   def __init__(self, title, price):
//       self.title = title
//       self.price = price
//
// In TypeScript, adding `public`, `protected`, or `private` directly in the
// constructor parameters AUTOMATICALLY declares and assigns the instance field!
export class ConciseTicket {
 constructor(
  public title: string,
  public price: number,
  public currency = "USD", // default parameter value
 ) {
  // Nothing needed in the body!
  // TypeScript automatically generated:
  // this.title = title;
  // this.price = price;
  // this.currency = currency;
 }
}

// ---------------------------------------------------------------------------
// 3. Getters and Setters (Python's @property and @setter)
// ---------------------------------------------------------------------------
export class GuardedTicket {
 private _price: number;

 constructor(
  public title: string,
  initialPrice: number,
 ) {
  this._price = initialPrice;
 }

 // Getter: accessed as `ticket.price` (not `ticket.price()`)
 get price(): number {
  return this._price;
 }

 // Setter: invoked when doing `ticket.price = 75`
 set price(newPrice: number) {
  if (newPrice <= 0) {
   throw new Error("Price must be greater than zero");
  }
  this._price = newPrice;
 }
}

// ---------------------------------------------------------------------------
// 4. Static Members (Python's @staticmethod / @classmethod / class attributes)
// ---------------------------------------------------------------------------
export class TicketFactory {
 // Static property: lives on the class itself, not on instances
 static defaultCurrency = "USD";

 // Static method: Python's @staticmethod
 static createVipTicket(title: string, price: number): ConciseTicket {
  return new ConciseTicket(
   `[VIP] ${title}`,
   price * 1.5,
   TicketFactory.defaultCurrency,
  );
 }
}
