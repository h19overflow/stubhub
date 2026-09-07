import type { Subjects } from "./subjects.js";

/**
 * Event published when an order is cancelled.
 */
export interface OrderCancelledEvent {
  subject: Subjects.OrderCancelled;
  data: {
    id: string;
    version: number;
    correlationId?: string;
    ticket: {
      id: string;
    };
  };
}
