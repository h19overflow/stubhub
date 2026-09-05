import type { Subjects } from "./subjects.js";

/**
 * Event published when a new ticket listing is created.
 * Binds `Subjects.TicketCreated` to the ticket creation payload.
 */
export interface TicketCreatedEvent {
  subject: Subjects.TicketCreated;
  data: {
    id: string;
    title: string;
    price: number;
    userId?: string;
  };
}
