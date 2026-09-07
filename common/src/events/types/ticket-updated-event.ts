import type { Subjects } from "./subjects.js";

/**
 * Event published when an existing ticket listing is updated.
 */
export interface TicketUpdatedEvent {
  subject: Subjects.TicketUpdated;
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
