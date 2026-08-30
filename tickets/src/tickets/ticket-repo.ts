import { database } from "../database.js";
import { toTicket } from "./ticket.js";
import type {
  ConvergenceOutcome,
  CreateTicketInput,
  CreateTicketResult,
  OrderEvent,
  ReleaseReservationOutcome,
  Reservation,
  ReserveTicketResult,
  Ticket,
  TicketFilters,
  TicketPage,
  TicketRow,
  UpdateTicketPriceResult,
} from "./ticket.js";

const ticketColumns = `
  id,
  owner_id,
  event_name,
  description,
  event_starts_at,
  event_ends_at,
  ticket_info,
  place,
  price_cents,
  currency,
  image_filename,
  status,
  locked_by_order_id,
  lock_expires_at,
  idempotency_key,
  request_fingerprint,
  created_at,
  updated_at
`;

type Predicate = { sql: string; bindings: Array<number | string> };

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function readTicketById(id: string): TicketRow | null {
  const row = database
    .prepare(`SELECT ${ticketColumns} FROM tickets WHERE id = ?`)
    .get(id) as TicketRow | undefined;
  return row ?? null;
}

function readTicketByOwnerKey(
  ownerId: string,
  idempotencyKey: string,
): TicketRow | null {
  const row = database
    .prepare(
      `SELECT ${ticketColumns}
       FROM tickets
       WHERE owner_id = ? AND idempotency_key = ?`,
    )
    .get(ownerId, idempotencyKey) as TicketRow | undefined;
  return row ?? null;
}

function commit<T>(result: T): T {
  database.exec("COMMIT");
  return result;
}

function toReservation(row: TicketRow): Reservation {
  if (!row.locked_by_order_id || row.lock_expires_at === null) {
    throw new Error("Ticket does not have an active reservation");
  }
  return {
    ticketId: row.id,
    orderId: row.locked_by_order_id,
    expiresAt: new Date(row.lock_expires_at).toISOString(),
    priceCents: row.price_cents,
    currency: row.currency,
    ticket: {
      eventName: row.event_name,
      eventStartsAt: new Date(row.event_starts_at).toISOString(),
      eventEndsAt:
        row.event_ends_at === null
          ? null
          : new Date(row.event_ends_at).toISOString(),
      place: row.place,
      ticketInfo: row.ticket_info,
    },
  };
}

function pageFor(
  tickets: Ticket[],
  page: number,
  pageSize: number,
  total: number,
): TicketPage {
  return {
    tickets,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  };
}

function availablePredicates(filters: TicketFilters): Predicate {
  const sql = ["status = ?"];
  const bindings: Array<number | string> = ["available"];

  if (filters.q) {
    const q = `%${escapeLike(filters.q)}%`;
    sql.push(`(
      event_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      description LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      ticket_info LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      place LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`);
    bindings.push(q, q, q, q);
  }
  if (filters.place) {
    sql.push("place LIKE ? ESCAPE '\\' COLLATE NOCASE");
    bindings.push(`%${escapeLike(filters.place)}%`);
  }
  if (filters.startsAfter !== undefined) {
    sql.push("event_starts_at >= ?");
    bindings.push(filters.startsAfter);
  }
  if (filters.startsBefore !== undefined) {
    sql.push("event_starts_at <= ?");
    bindings.push(filters.startsBefore);
  }
  if (filters.minPriceCents !== undefined) {
    sql.push("price_cents >= ?");
    bindings.push(filters.minPriceCents);
  }
  if (filters.maxPriceCents !== undefined) {
    sql.push("price_cents <= ?");
    bindings.push(filters.maxPriceCents);
  }

  return { sql: `WHERE ${sql.join(" AND ")}`, bindings };
}

function createTicket(input: CreateTicketInput): CreateTicketResult {
  database.exec("BEGIN IMMEDIATE");
  try {
    const now = Date.now();
    const inserted = database
      .prepare(
        `INSERT INTO tickets (
          id,
          owner_id,
          event_name,
          description,
          event_starts_at,
          event_ends_at,
          ticket_info,
          place,
          price_cents,
          image_filename,
          idempotency_key,
          request_fingerprint,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_id, idempotency_key) DO NOTHING`,
      )
      .run(
        input.id,
        input.ownerId,
        input.eventName,
        input.description,
        input.eventStartsAt,
        input.eventEndsAt,
        input.ticketInfo,
        input.place,
        input.priceCents,
        input.imageFilename,
        input.idempotencyKey,
        input.requestFingerprint,
        now,
        now,
      );

    if (Number(inserted.changes) === 1) {
      const row = readTicketById(input.id);
      if (!row) {
        throw new Error("Created ticket could not be read");
      }
      return commit({ outcome: "created", ticket: toTicket(row) });
    }

    const row = readTicketByOwnerKey(input.ownerId, input.idempotencyKey);
    if (!row) {
      throw new Error("Idempotent ticket could not be read");
    }
    if (row.request_fingerprint === input.requestFingerprint) {
      return commit({ outcome: "replayed", ticket: toTicket(row) });
    }

    return commit({ outcome: "conflict" });
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function updateTicketPrice(
  ownerId: string,
  ticketId: string,
  priceCents: number,
): UpdateTicketPriceResult {
  database.exec("BEGIN IMMEDIATE");
  try {
    const updated = database
      .prepare(
        `UPDATE tickets
         SET price_cents = ?, updated_at = ?
         WHERE id = ? AND owner_id = ? AND status = 'available'`,
      )
      .run(priceCents, Date.now(), ticketId, ownerId);

    if (Number(updated.changes) === 1) {
      const row = readTicketById(ticketId);
      if (!row) {
        throw new Error("Updated ticket could not be read");
      }
      return commit({ outcome: "updated", ticket: toTicket(row) });
    }

    const row = database
      .prepare("SELECT id FROM tickets WHERE id = ? AND owner_id = ?")
      .get(ticketId, ownerId) as { id: string } | undefined;

    if (!row) {
      return commit({ outcome: "not_found" });
    }
    return commit({ outcome: "unavailable" });
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function listAvailableTickets(filters: TicketFilters): TicketPage {
  const predicates = availablePredicates(filters);
  const count = database
    .prepare(`SELECT COUNT(*) AS total FROM tickets ${predicates.sql}`)
    .get(...predicates.bindings) as { total: number };
  const rows = database
    .prepare(
      `SELECT ${ticketColumns}
       FROM tickets
       ${predicates.sql}
       ORDER BY event_starts_at ASC, id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(
      ...predicates.bindings,
      filters.pageSize,
      (filters.page - 1) * filters.pageSize,
    ) as TicketRow[];

  return pageFor(
    rows.map(toTicket),
    filters.page,
    filters.pageSize,
    count.total,
  );
}

function listOwnedTickets(
  ownerId: string,
  page: number,
  pageSize: number,
): TicketPage {
  const count = database
    .prepare("SELECT COUNT(*) AS total FROM tickets WHERE owner_id = ?")
    .get(ownerId) as { total: number };
  const rows = database
    .prepare(
      `SELECT ${ticketColumns}
       FROM tickets
       WHERE owner_id = ?
       ORDER BY created_at DESC, id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(ownerId, pageSize, (page - 1) * pageSize) as TicketRow[];

  return pageFor(
    rows.map(toTicket),
    page,
    pageSize,
    count.total,
  );
}

function findTicketById(id: string): Ticket | null {
  const row = readTicketById(id);
  return row ? toTicket(row) : null;
}

function reserveTicket(
  ticketId: string,
  orderId: string,
  expiresAt: number,
): ReserveTicketResult {
  database.exec("BEGIN IMMEDIATE");
  try {
    const row = readTicketById(ticketId);
    if (!row) {
      return commit({ outcome: "not_found" });
    }

    const sameReservation =
      row.status === "reserved" && row.locked_by_order_id === orderId;
    if (sameReservation && row.lock_expires_at !== expiresAt) {
      return commit({ outcome: "conflict" });
    }
    if (sameReservation) {
      return commit({
        outcome: "replayed",
        reservation: toReservation(row),
      });
    }
    if (row.status !== "available") {
      return commit({ outcome: "unavailable" });
    }

    const otherLock = database
      .prepare(
        `SELECT id
         FROM tickets
         WHERE locked_by_order_id = ? AND id <> ?`,
      )
      .get(orderId, ticketId);
    if (otherLock) {
      return commit({ outcome: "unavailable" });
    }

    const updated = database
      .prepare(
        `UPDATE tickets
         SET status = 'reserved',
             locked_by_order_id = ?,
             lock_expires_at = ?,
             updated_at = ?
         WHERE id = ? AND status = 'available'`,
      )
      .run(orderId, expiresAt, Date.now(), ticketId);
    if (Number(updated.changes) !== 1) {
      throw new Error("Reservation guard changed unexpectedly");
    }

    const reserved = readTicketById(ticketId);
    if (!reserved) {
      throw new Error("Reserved ticket could not be read");
    }
    return commit({
      outcome: "reserved",
      reservation: toReservation(reserved),
    });
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function findReservation(
  ticketId: string,
  orderId: string,
): Reservation | null {
  const row = readTicketById(ticketId);
  if (
    !row ||
    row.status !== "reserved" ||
    row.locked_by_order_id !== orderId
  ) {
    return null;
  }
  return toReservation(row);
}

function releaseReservation(
  ticketId: string,
  orderId: string,
): ReleaseReservationOutcome {
  database.exec("BEGIN IMMEDIATE");
  try {
    const row = readTicketById(ticketId);
    if (!row) {
      return commit("missing");
    }
    if (row.status === "available") {
      return commit("already_available");
    }
    if (row.status === "sold") {
      return commit("sold");
    }
    if (row.locked_by_order_id !== orderId) {
      return commit("not_matching");
    }

    const released = database
      .prepare(
        `UPDATE tickets
         SET status = 'available',
             locked_by_order_id = NULL,
             lock_expires_at = NULL,
             updated_at = ?
         WHERE id = ?
           AND status = 'reserved'
           AND locked_by_order_id = ?`,
      )
      .run(Date.now(), ticketId, orderId);
    if (Number(released.changes) !== 1) {
      throw new Error("Release guard changed unexpectedly");
    }
    return commit("released");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Classifies how an order event should converge the current Ticket row without
 * changing it. Missing, already-available, already-sold, and another order's
 * reservation become non-mutating outcomes; only a matching reserved lock
 * requests the sold or released transition.
 */
function convergenceOutcome(
  row: TicketRow | null,
  event: OrderEvent,
): ConvergenceOutcome {
  if (!row) {
    return "missing";
  }
  if (row.status === "available") {
    return "already_available";
  }
  if (row.locked_by_order_id !== event.aggregateId) {
    return "not_matching";
  }
  if (row.status === "sold") {
    return "already_sold";
  }
  return event.eventType === "order.completed" ? "sold" : "released";
}

/**
 * Applies the guarded completion transition inside consumeOrderEvent's
 * transaction. Only a reserved ticket locked by this event's order becomes
 * sold; an unexpected row count throws so the receipt cannot commit falsely.
 */
function applySoldConvergence(event: OrderEvent): void {
  const changed = database
    .prepare(
      `UPDATE tickets
       SET status = 'sold',
           lock_expires_at = NULL,
           updated_at = ?
       WHERE id = ?
         AND status = 'reserved'
         AND locked_by_order_id = ?`,
    )
    .run(Date.now(), event.payload.ticketId, event.aggregateId);
  if (Number(changed.changes) !== 1) {
    throw new Error("Sold convergence guard changed unexpectedly");
  }
}

/**
 * Applies the guarded expiration transition inside consumeOrderEvent's
 * transaction. Only a reserved ticket locked by this event's order becomes
 * available and loses its reservation; an unexpected row count throws.
 */
function applyReleaseConvergence(event: OrderEvent): void {
  const changed = database
    .prepare(
      `UPDATE tickets
       SET status = 'available',
           locked_by_order_id = NULL,
           lock_expires_at = NULL,
           updated_at = ?
       WHERE id = ?
         AND status = 'reserved'
         AND locked_by_order_id = ?`,
    )
    .run(Date.now(), event.payload.ticketId, event.aggregateId);
  if (Number(changed.changes) !== 1) {
    throw new Error("Release convergence guard changed unexpectedly");
  }
}

/**
 * Atomically consumes an order event by checking the inbox, applying the
 * guarded Ticket transition, and recording the inbox receipt in one
 * transaction. A duplicate commits no state change and returns
 * `{ duplicate: true }`; first processing returns its outcome. Errors roll
 * back both changes so the Redis caller can retry without acknowledging.
 */
function consumeOrderEvent(
  event: OrderEvent,
): { duplicate: boolean; outcome?: ConvergenceOutcome } {
  const consumer = "tickets-order-convergence";
  database.exec("BEGIN IMMEDIATE");
  try {
    const duplicate = database
      .prepare(
        `SELECT 1
         FROM inbox_messages
         WHERE consumer = ? AND message_id = ?`,
      )
      .get(consumer, event.messageId);
    if (duplicate) {
      return commit({ duplicate: true });
    }

    const row = readTicketById(event.payload.ticketId);
    const outcome = convergenceOutcome(row, event);
    if (outcome === "sold") {
      applySoldConvergence(event);
    } else if (outcome === "released") {
      applyReleaseConvergence(event);
    }

    database
      .prepare(
        `INSERT INTO inbox_messages (
           consumer,
           message_id,
           event_type,
           event_version,
           aggregate_id,
           aggregate_version,
           ticket_id,
           outcome,
           processed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        consumer,
        event.messageId,
        event.eventType,
        event.eventVersion,
        event.aggregateId,
        event.aggregateVersion,
        event.payload.ticketId,
        outcome,
        Date.now(),
      );
    return commit({ duplicate: false, outcome });
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export {
  consumeOrderEvent,
  createTicket,
  findReservation,
  findTicketById,
  listAvailableTickets,
  listOwnedTickets,
  releaseReservation,
  reserveTicket,
  updateTicketPrice,
};
