import type { Subjects } from "./subjects.js";
import type { OrderStatus } from "./order-status.js";

/**
 * Event published when a new order is created.
 */
export interface OrderCreatedEvent {
  subject: Subjects.OrderCreated;
  data: {
    id: string;
    version: number;
    status: OrderStatus | string;
    userId: string;
    expiresAt: string;
    correlationId?: string;
    ticket: {
      id: string;
      price: number;
    };
  };
}
