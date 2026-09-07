import type { Subjects } from "./subjects.js";

/**
 * Event published when a new ticket listing is created.
 */
export interface TicketCreatedEvent {
  subject: Subjects.TicketCreated;
  data: {
    id: string;
    title: string;
    price: number;
    userId?: string;
    version?: number;
    orderId?: string;
    correlationId?: string;
  };
}
