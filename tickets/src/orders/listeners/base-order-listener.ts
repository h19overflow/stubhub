import type { Message } from "node-nats-streaming";
import { applyOrderEventOnce } from "../../tickets/ticket-repo.js";
import type { OrderEvent } from "../../tickets/ticket.js";

type OrderEventData = {
  id: string;
  version?: number;
  messageId?: string;
  ticketId?: string;
  ticket?: { id: string };
  occurredAt?: string;
  correlationId?: string;
};

/**
 * Shared message processing logic for Tickets order convergence listeners.
 * Normalizes NATS message payload into an authoritative OrderEvent,
 * applies guarded ticket convergence atomically, and acknowledges the message.
 */
export function handleOrderConvergenceMessage(
  eventType: "order.completed" | "order.expired",
  data: OrderEventData,
  msg: Message,
): void {
  const ticketId = data.ticketId ?? data.ticket?.id ?? "";
  const orderEvent: OrderEvent = {
    messageId: data.messageId ?? msg.getSequence().toString(),
    eventType,
    eventVersion: 1,
    aggregateType: "order",
    aggregateId: data.id,
    aggregateVersion: data.version ?? 1,
    occurredAt: data.occurredAt ?? new Date().toISOString(),
    correlationId: data.correlationId,
    payload: { ticketId },
  };

  applyOrderEventOnce(orderEvent);
  msg.ack();
}
