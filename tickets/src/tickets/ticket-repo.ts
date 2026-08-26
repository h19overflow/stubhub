import { database } from "../database.js";
import { toTicket } from "./ticket.js";
import type { Ticket, TicketFilters, TicketPage, TicketRow } from "./ticket.js";

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

function pageFor(tickets: Ticket[], page: number, pageSize: number, total: number): TicketPage {
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
    .all(...predicates.bindings, filters.pageSize, (filters.page - 1) * filters.pageSize) as TicketRow[];

  return pageFor(rows.map(toTicket), filters.page, filters.pageSize, count.total);
}

function listOwnedTickets(ownerId: string, page: number, pageSize: number): TicketPage {
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

  return pageFor(rows.map(toTicket), page, pageSize, count.total);
}

function findTicketById(id: string): Ticket | null {
  const row = database
    .prepare(`SELECT ${ticketColumns} FROM tickets WHERE id = ?`)
    .get(id) as TicketRow | undefined;
  return row ? toTicket(row) : null;
}

export { findTicketById, listAvailableTickets, listOwnedTickets };
