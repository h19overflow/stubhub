import type { Message } from "node-nats-streaming";
import { Listener, Subjects, type OrderCompletedEvent } from "@stubhub/common";
import { applyOrderEventOnce } from "../../tickets/ticket-repo.js";
import {
  ticketsOrderConvergenceConsumer,
  type OrderEvent,
} from "../../tickets/ticket.js";

/**
 * Listener for `order:completed` events in Tickets service.
 * Transitions matching reserved ticket to sold state.
 */
export class OrderCompletedListener extends Listener<OrderCompletedEvent> {
  readonly subject = Subjects.OrderCompleted;
  queueGroupName = ticketsOrderConvergenceConsumer;

  async onMessage(
    data: OrderCompletedEvent["data"],
    msg: Message,
  ): Promise<void> {
    const ticketId = data.ticketId ?? data.ticket?.id ?? "";
    const orderEvent: OrderEvent = {
      messageId: data.messageId ?? msg.getSequence().toString(),
      eventType: "order.completed",
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
}
