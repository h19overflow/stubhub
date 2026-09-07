const { DatabaseSync } = require("node:sqlite");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

const TICKET_ID = "ticket-portfolio-001";
const TICKET_PRICE_CENTS = 12_500;
const RESERVATION_BUYERS = [
  "buyer-1",
  "buyer-2",
  "buyer-3",
  "buyer-4",
  "buyer-5",
];
const WORKER_LEASE_MS = 30_000;

type TicketRow = {
  id: string;
  status: "available" | "reserved" | "sold";
  price_cents: number;
  locked_by_order_id: string | null;
};

type PurchaseResult = {
  buyerId: string;
  orderId: string;
  outcome: "won" | "conflict";
};

type WorkerClaim = {
  workerId: string;
  publicationId: number | null;
  lockedUntil: number | null;
};

const startedAt = Date.now();
const db = new DatabaseSync(":memory:");

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

function log(message: string, color = CYAN): void {
  console.log(`${DIM}[${timestamp()}]${RESET} ${color}${message}${RESET}`);
}

function phase(number: number, title: string): void {
  console.log(`\n${BOLD}${YELLOW}PHASE ${number} · ${title}${RESET}`);
}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Verification failed: ${message}`);
  }
}

function runTransaction<T>(work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function nextTurn<T>(work: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(work());
      } catch (error) {
        reject(error);
      }
    });
  });
}

function setupDatabase(): void {
  db.exec(`
    CREATE TABLE tickets (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'sold')),
      price_cents INTEGER NOT NULL CHECK (price_cents > 0),
      locked_by_order_id TEXT
    ) STRICT;

    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES tickets(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'expired')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
    ) STRICT;

    CREATE TABLE order_event_publications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      published_at INTEGER,
      locked_by TEXT,
      locked_until INTEGER
    ) STRICT;

    CREATE INDEX order_event_publications_due
      ON order_event_publications(published_at, locked_until, created_at, id);
  `);

  db.prepare(`
    INSERT INTO tickets (id, status, price_cents, locked_by_order_id)
    VALUES (?, 'available', ?, NULL)
  `).run(TICKET_ID, TICKET_PRICE_CENTS);
}

function attemptPurchase(buyerId: string, attemptNumber: number): PurchaseResult {
  const orderId = `order-${attemptNumber}`;
  log(`${buyerId} enters SQLite transaction for ${orderId}`);

  return runTransaction(() => {
    const ticket = db
      .prepare("SELECT price_cents FROM tickets WHERE id = ?")
      .get(TICKET_ID) as TicketRow | undefined;
    expect(ticket !== undefined, `seeded ticket ${TICKET_ID} must exist`);

    // This guarded UPDATE is the entire reservation race: SQLite can commit
    // only one row-changing winner while every later attempt sees 0 changes.
    const claimed = db
      .prepare(`
        UPDATE tickets
        SET locked_by_order_id = ?, status = 'reserved'
        WHERE id = ?
          AND locked_by_order_id IS NULL
          AND status = 'available'
      `)
      .run(orderId, TICKET_ID);

    if (Number(claimed.changes) !== 1) {
      log(`${buyerId} → 409 Conflict (guarded UPDATE changed 0 rows)`, RED);
      return { buyerId, orderId, outcome: "conflict" };
    }

    const now = Date.now();
    db.prepare(`
      INSERT INTO orders (id, buyer_id, ticket_id, status, amount_cents)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(orderId, buyerId, TICKET_ID, ticket.price_cents);

    db.prepare(`
      INSERT INTO order_event_publications (
        order_id, event_type, payload, created_at, published_at, locked_by, locked_until
      ) VALUES (?, 'order.reserved', ?, ?, NULL, NULL, NULL)
    `).run(
      orderId,
      JSON.stringify({
        orderId,
        buyerId,
        ticketId: TICKET_ID,
        amountCents: ticket.price_cents,
      }),
      now,
    );

    log(
      `${buyerId} → COMMIT winner (ticket lock, order, and outbox row are atomic)`,
      GREEN,
    );
    return { buyerId, orderId, outcome: "won" };
  });
}

function claimDuePublication(workerId: string, now: number): WorkerClaim {
  log(`${workerId} starts claim with BEGIN IMMEDIATE`);

  return runTransaction(() => {
    const publication = db
      .prepare(`
        SELECT id
        FROM order_event_publications
        WHERE published_at IS NULL
          AND (locked_until IS NULL OR locked_until <= ?)
        ORDER BY created_at, id
        LIMIT 1
      `)
      .get(now) as { id: number } | undefined;

    if (!publication) {
      log(`${workerId} → no due event (the other worker owns the lease)`, RED);
      return { workerId, publicationId: null, lockedUntil: null };
    }

    const lockedUntil = now + WORKER_LEASE_MS;
    const leased = db
      .prepare(`
        UPDATE order_event_publications
        SET locked_by = ?, locked_until = ?
        WHERE id = ?
          AND published_at IS NULL
          AND (locked_until IS NULL OR locked_until <= ?)
      `)
      .run(workerId, lockedUntil, publication.id, now);

    if (Number(leased.changes) !== 1) {
      log(`${workerId} → no lease (guarded UPDATE changed 0 rows)`, RED);
      return { workerId, publicationId: null, lockedUntil: null };
    }

    log(
      `${workerId} → CLAIMED publication #${publication.id} until ${new Date(lockedUntil).toISOString()}`,
      GREEN,
    );
    return { workerId, publicationId: publication.id, lockedUntil };
  });
}

async function main(): Promise<void> {
  console.log(`\n${BOLD}${CYAN}StubHub · deterministic concurrency drill${RESET}`);
  console.log(`${DIM}Native Node.js 24 node:sqlite · one ticket · five buyers · two workers${RESET}`);

  phase(1, "Build the authoritative SQLite state");
  log("Opening DatabaseSync(':memory:') with Tickets and Orders tables");
  setupDatabase();
  log(`Seeded ${TICKET_ID} as available at $${(TICKET_PRICE_CENTS / 100).toFixed(2)}`, GREEN);

  phase(2, "Five asynchronous buyers race for one ticket");
  log("Promise.all schedules 5 attempts; each enters BEGIN IMMEDIATE and runs the guarded UPDATE");
  log(
    "Guard: WHERE id = ticket AND locked_by_order_id IS NULL AND status = 'available'",
    YELLOW,
  );
  const purchaseResults = await Promise.all(
    RESERVATION_BUYERS.map((buyerId, index) =>
      nextTurn(() => attemptPurchase(buyerId, index + 1)),
    ),
  );

  const winners = purchaseResults.filter(({ outcome }) => outcome === "won");
  const conflicts = purchaseResults.filter(({ outcome }) => outcome === "conflict");
  const ticket = db
    .prepare("SELECT * FROM tickets WHERE id = ?")
    .get(TICKET_ID) as TicketRow;
  const orderCount = db
    .prepare("SELECT COUNT(*) AS count FROM orders")
    .get() as { count: number };
  const publicationCount = db
    .prepare("SELECT COUNT(*) AS count FROM order_event_publications")
    .get() as { count: number };

  expect(winners.length === 1, "exactly one buyer wins");
  expect(conflicts.length === 4, "exactly four buyers receive Conflict / 409");
  expect(ticket.status === "reserved", "winning reservation changes ticket status");
  expect(ticket.locked_by_order_id === winners[0].orderId, "ticket points to winning order");
  expect(orderCount.count === 1, "one order is persisted");
  expect(publicationCount.count === 1, "one outbox publication is persisted");
  log(
    `Verified: ${winners[0].buyerId} owns the only reservation; ${conflicts.length} buyers were rejected with 409`,
    GREEN,
  );
  log("Verified: the winning order and order_event_publications row committed with the lock", GREEN);

  phase(3, "Two workers compete for the due outbox event");
  const workerNow = Date.now();
  log("Promise.all schedules worker-A and worker-B; each lease transaction begins with BEGIN IMMEDIATE");
  const claims = await Promise.all([
    nextTurn(() => claimDuePublication("worker-A", workerNow)),
    nextTurn(() => claimDuePublication("worker-B", workerNow)),
  ]);
  const leaseOwners = claims.filter(({ publicationId }) => publicationId !== null);
  const outbox = db
    .prepare("SELECT locked_by, locked_until, published_at FROM order_event_publications WHERE id = 1")
    .get() as {
    locked_by: string | null;
    locked_until: number | null;
    published_at: number | null;
  };

  expect(leaseOwners.length === 1, "exactly one worker claims the publication lease");
  expect(outbox.locked_by === leaseOwners[0].workerId, "outbox records the lease owner");
  expect(outbox.locked_until !== null && outbox.locked_until > workerNow, "lease has not expired");
  expect(outbox.published_at === null, "claiming does not mark publication sent");
  log(
    `Verified: ${leaseOwners[0].workerId} holds the only lease; the other worker cleanly found no due row`,
    GREEN,
  );

  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs < 1_000, `drill completes in under one second (actual ${elapsedMs}ms)`);
  console.log(`\n${BOLD}${GREEN}PASS${RESET} ${GREEN}Concurrency protection and worker leasing verified in ${elapsedMs}ms.${RESET}\n`);
  db.close();
}

main().catch((error: unknown) => {
  console.error(`\n${BOLD}${RED}FAIL${RESET} ${error instanceof Error ? error.message : String(error)}`);
  db.close();
  process.exitCode = 1;
});
