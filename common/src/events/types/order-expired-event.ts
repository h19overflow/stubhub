import type { Subjects } from "./subjects.js";

/**
 * Event published when an unpaid pending order expires.
 */
export interface OrderExpiredEvent {
  subject: Subjects.OrderExpired;
  data: {
    id: string;
    version?: number;
    messageId?: string;
    correlationId?: string;
    ticketId?: string;
    ticket?: {
      id: string;
    };
    occurredAt?: string;
  };
}
