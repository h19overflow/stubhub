export type TicketFilters = {
  q?: string;
  place?: string;
  startsAfter?: string;
  startsBefore?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  page?: number;
  pageSize?: number;
};

export type CreateTicketInput = {
  eventName: string;
  description: string;
  eventStartsAt: string;
  eventEndsAt?: string;
  ticketInfo: string;
  place: string;
  priceCents: number;
  image: File;
};
