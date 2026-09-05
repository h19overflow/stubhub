import type { Subjects } from "./subjects.js";

/**
 * Event published when an order payment succeeds and the order completes.
 */
export interface OrderCompletedEvent {
  subject: Subjects.OrderCompleted;
  data: {
    id: string;
    version?: number;
    messageId?: string;
    ticketId?: string;
    ticket?: {
      id: string;
    };
    occurredAt?: string;
  };
}
