# Object-Oriented Programming in TypeScript (Python Developer's Guide)

This guide translates core Object-Oriented Programming (OOP) concepts from **Python** to **TypeScript**, explaining both **how they work** and **why they work that way** under the hood.

---

## 1. Quick Reference: Python vs TypeScript Rosetta Stone

| OOP Concept | Python | TypeScript |
| :--- | :--- | :--- |
| **Class definition** | `class Ticket:` | `class Ticket { ... }` |
| **Constructor / Initializer** | `def __init__(self, title, price):` | `constructor(title: string, price: number) { ... }` |
| **Instance reference** | `self.title` | `this.title` |
| **Call parent constructor** | `super().__init__(...)` | `super(...)` |
| **Public property** | `self.title = title` | `public title: string;` (default) |
| **Protected member** | `self._title = title` *(convention only)* | `protected title: string;` *(enforced at compile time)* |
| **Private member** | `self.__title = title` *(name mangling)* | `private title: string;` or `#title: string;` |
| **Parameter shorthand** | `@dataclass` | `constructor(public title: string) {}` |
| **Getter / Setter** | `@property` / `@price.setter` | `get price(): number` / `set price(val)` |
| **Abstract class** | `class Base(ABC):` | `abstract class Base { ... }` |
| **Abstract method** | `@abstractmethod def run(self): pass` | `abstract run(): void;` |
| **Interface / Protocol** | `typing.Protocol` | `interface MessageHandler { ... }` |
| **Inheritance** | `class Child(Parent):` | `class Child extends Parent { ... }` |
| **Implements interface** | Implicit or `class S(Protocol):` | `class Service implements IService { ... }` |
| **Generics** | `class Repository[T]:` | `class Repository<T> { ... }` |
| **Bounded generic** | `TypeVar('T', bound=Event)` | `<T extends Event>` |
| **Static method** | `@staticmethod def make():` | `static make(): Ticket { ... }` |

---

## 2. Core Concepts Explained

### Concept 1: Constructors & Fields (`__init__` vs `constructor`)

#### Python

```python
class Ticket:
    def __init__(self, title: str, price: float):
        self.title = title
        self.price = price
```

#### TypeScript

```ts
class Ticket {
  title: string;
  price: number;

  constructor(title: string, price: number) {
    this.title = title;
    this.price = price;
  }
}
```

#### TypeScript Superpower: Parameter Properties

In Python, writing `self.x = x` for ten fields gets tedious. In TypeScript, prefixing constructor arguments with `public`, `protected`, or `private` auto-declares and assigns them:

```ts
class Ticket {
  // Automatically creates and assigns this.title and this.price:
  constructor(public title: string, public price: number) {}
}
```

---

### Concept 2: Access Modifiers & Encapsulation

In Python, there is no true privacy—`_protected` is a gentleman's agreement, and `__private` is just name-mangling (`_ClassName__field`).

In TypeScript, you have two layers:

1. **Compile-time modifiers (`public`, `protected`, `private`)**: Checked strictly during compilation.
   - `public`: Accessible anywhere.
   - `protected`: Accessible inside this class and any derived subclasses.
   - `private`: Accessible only within this exact class.
2. **ECMAScript runtime private (`#field`)**: Hard private enforced by the JavaScript engine at runtime.

```ts
class Account {
  public username: string;      // Anyone can access
  protected balance: number;    // Subclasses can access
  private internalToken: string;// Only Account can access (compile-time)
  #bankSecret: string;          // Hard private (runtime)
}
```

---

### Concept 3: Inheritance & Why `super()` Must Come First

#### Python

```python
class Child(Parent):
    def __init__(self, name):
        # In Python, you can run logic before super()
        print("Before super")
        super().__init__(name)
```

#### TypeScript

```ts
class Child extends Parent {
  constructor(name: string) {
    // ⚠️ MUST call super() before accessing `this`!
    super(name);
    console.log(this.name);
  }
}
```

#### Why does it work like that?

In JavaScript/TypeScript, derived classes **do not allocate their own `this` instance**. Calling `super()` delegates instance allocation and prototype binding to the parent class constructor. Until `super()` returns, `this` is uninitialized.

---

### Concept 4: Abstract Classes vs Interfaces

| Feature | `abstract class` | `interface` |
| :--- | :--- | :--- |
| **Can contain implementation?** | Yes (shared logic, default methods) | No (shapes/signatures only) |
| **Can hold state / fields?** | Yes (`protected ackWait = 5000`) | No (only type declarations) |
| **Can be instantiated?** | No (`new Base()` is an error) | No |
| **Emits code in compiled JS?** | Yes (compiled to a JavaScript class) | **Zero bytes** (erased completely) |
| **Inheritance limit** | Can only `extend` **one** class | Can `implement` **multiple** interfaces |

#### When to use what?

- Use **`abstract class`** when you want to provide **reusable mechanics** (like our `Listener` and `Publisher` which handle subscription options, JSON parsing, and promisified publishing).
- Use **`interface`** when defining **data contracts** or capability contracts without shared implementation (like `Event` or `TicketCreatedEvent`).

---

### Concept 5: Generics in OOP (`<T extends Event>`)

In Python:

```python
from typing import Generic, TypeVar

T = TypeVar("T", bound=Event)

class Listener(Generic[T]):
    def on_message(self, data: T):
        pass
```

In TypeScript:

```ts
export abstract class Listener<T extends Event> {
  abstract subject: T['subject'];
  abstract onMessage(data: T['data'], msg: Message): void;
}
```

#### Why `<T extends Event>` is so powerful

When a subclass defines:

```ts
class TicketCreatedListener extends Listener<TicketCreatedEvent>
```

TypeScript automatically infers:

1. `this.subject` must match `'ticket:created'`.
2. `onMessage(data)` automatically receives `{ id: string; title: string; price: number }`.
3. If the producer alters the event schema, the listener immediately flags a compile-time error.

---

## 3. Directory Structure

- `01-classes-and-constructors.ts` — Classes, `constructor`, `this`, parameter properties, getters/setters, and static members.
- `02-encapsulation-and-modifiers.ts` — `public`, `protected`, `private`, `readonly`, and `#runtimePrivate`.
- `03-inheritance-and-abstract.ts` — `extends`, `super()`, `abstract class`, `abstract` methods, and `override`.
- `04-interfaces-and-polymorphism.ts` — `interface`, `implements`, structural typing, and polymorphism.
- `05-generics-in-oop.ts` — Generic classes, type constraints (`<T extends DomainEvent>`), and schema safety.
