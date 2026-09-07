import type { Message } from "node-nats-streaming";
import { Listener, Subjects, type OrderExpiredEvent } from "@stubhub/common";
import { applyOrderEventOnce } from "../../tickets/ticket-repo.js";
import {
  ticketsOrderConvergenceConsumer,
  type OrderEvent,
} from "../../tickets/ticket.js";

/**
 * Listener for `order:expired` events in Tickets service.
 * Releases matching reserved ticket back to available state.
 */
export class OrderExpiredListener extends Listener<OrderExpiredEvent> {
  readonly subject = Subjects.OrderExpired;
  queueGroupName = ticketsOrderConvergenceConsumer;

  async onMessage(
    data: OrderExpiredEvent["data"],
    msg: Message,
  ): Promise<void> {
    const ticketId = data.ticketId ?? data.ticket?.id ?? "";
    const orderEvent: OrderEvent = {
      messageId: data.messageId ?? msg.getSequence().toString(),
      eventType: "order.expired",
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
