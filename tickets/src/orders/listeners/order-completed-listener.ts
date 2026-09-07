import type { Message } from "node-nats-streaming";
import { Listener, Subjects, type OrderCompletedEvent } from "@stubhub/common";
import { ticketsOrderConvergenceConsumer } from "../../tickets/ticket.js";
import { handleOrderConvergenceMessage } from "./base-order-listener.js";

/**
 * Listener for `order.completed` events in Tickets service.
 * Transitions matching reserved ticket to sold state.
 */
export class OrderCompletedListener extends Listener<OrderCompletedEvent> {
  readonly subject = Subjects.OrderCompleted;
  queueGroupName = ticketsOrderConvergenceConsumer;

  async onMessage(
    data: OrderCompletedEvent["data"],
    msg: Message,
  ): Promise<void> {
    handleOrderConvergenceMessage("order.completed", data, msg);
  }
}
