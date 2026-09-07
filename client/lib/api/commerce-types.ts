export type TicketStatus = "available" | "reserved" | "sold";
export type OrderStatus = "pending" | "payment_processing" | "complete" | "expired";
export type PaymentAttemptStatus = "processing" | "succeeded" | "failed";
export type Currency = "USD";

export type Ticket = {
  id: string;
  eventName: string;
  description: string;
  eventStartsAt: string;
  eventEndsAt: string | null;
  ticketInfo: string;
  place: string;
  priceCents: number;
  currency: Currency;
  imageUrl: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type TicketPage = {
  tickets: Ticket[];
  pagination: Pagination;
};

export type OrderTicketSnapshot = {
  eventName: string;
  description: string | null;
  eventStartsAt: string;
  eventEndsAt: string | null;
  place: string;
  ticketInfo: string;
};

export type Order = {
  id: string;
  ticketId: string;
  sellerUserId: string | null;
  amountCents: number;
  currency: Currency;
  status: OrderStatus;
  expiresAt: string;
  version: number;
  ticket: OrderTicketSnapshot;
  createdAt: string;
  updatedAt: string;
};

export type PaymentAttempt = {
  id: string;
  orderId: string;
  status: PaymentAttemptStatus;
  providerReference: string | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export function ensureObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid service response");
  }
  return value as Record<string, unknown>;
}
const object = ensureObject;

function string(value: unknown) {
  if (typeof value !== "string") throw new Error("Invalid service response");
  return value;
}

function nullableString(value: unknown) {
  return value === null ? null : string(value);
}

function number(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Invalid service response");
  }
  return value;
}

function currency(value: unknown): Currency {
  if (value !== "USD") throw new Error("Invalid service response");
  return value;
}

export function parseTicket(value: unknown): Ticket {
  const body = object(value);
  const status = string(body.status);
  if (status !== "available" && status !== "reserved" && status !== "sold") {
    throw new Error("Invalid service response");
  }

  return {
    id: string(body.id),
    eventName: string(body.eventName),
    description: string(body.description),
    eventStartsAt: string(body.eventStartsAt),
    eventEndsAt: nullableString(body.eventEndsAt),
    ticketInfo: string(body.ticketInfo),
    place: string(body.place),
    priceCents: number(body.priceCents),
    currency: currency(body.currency),
    imageUrl: string(body.imageUrl),
    status,
    createdAt: string(body.createdAt),
    updatedAt: string(body.updatedAt),
  };
}

export function parseTicketPage(value: unknown): TicketPage {
  const body = object(value);
  const pagination = object(body.pagination);
  if (!Array.isArray(body.tickets)) throw new Error("Invalid service response");

  return {
    tickets: body.tickets.map(parseTicket),
    pagination: {
      page: number(pagination.page),
      pageSize: number(pagination.pageSize),
      total: number(pagination.total),
      totalPages: number(pagination.totalPages),
    },
  };
}

export function parseOrder(value: unknown): Order {
  const body = object(value);
  const ticket = object(body.ticket);
  const status = string(body.status);
  if (
    status !== "pending" &&
    status !== "payment_processing" &&
    status !== "complete" &&
    status !== "expired"
  ) {
    throw new Error("Invalid service response");
  }

  return {
    id: string(body.id),
    ticketId: string(body.ticketId),
    sellerUserId: nullableString(body.sellerUserId),
    amountCents: number(body.amountCents),
    currency: currency(body.currency),
    status,
    expiresAt: string(body.expiresAt),
    version: number(body.version),
    ticket: {
      eventName: string(ticket.eventName),
      description: nullableString(ticket.description),
      eventStartsAt: string(ticket.eventStartsAt),
      eventEndsAt: nullableString(ticket.eventEndsAt),
      place: string(ticket.place),
      ticketInfo: string(ticket.ticketInfo),
    },
    createdAt: string(body.createdAt),
    updatedAt: string(body.updatedAt),
  };
}

export function parsePaymentAttempt(value: unknown): PaymentAttempt {
  const body = object(value);
  const status = string(body.status);
  if (status !== "processing" && status !== "succeeded" && status !== "failed") {
    throw new Error("Invalid service response");
  }

  return {
    id: string(body.id),
    orderId: string(body.orderId),
    status,
    providerReference: nullableString(body.providerReference),
    failureCode: nullableString(body.failureCode),
    createdAt: string(body.createdAt),
    updatedAt: string(body.updatedAt),
  };
}

export function wrapped<T>(key: string, parser: (value: unknown) => T) {
  return (value: unknown) => parser(object(value)[key]);
}
