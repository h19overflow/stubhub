import type { Message } from "node-nats-streaming";
import { Listener, Subjects, type OrderExpiredEvent } from "@stubhub/common";
import { ticketsOrderConvergenceConsumer } from "../../tickets/ticket.js";
import { handleOrderConvergenceMessage } from "./base-order-listener.js";

/**
 * Listener for `order.expired` events in Tickets service.
 * Releases matching reserved ticket back to available state.
 */
export class OrderExpiredListener extends Listener<OrderExpiredEvent> {
  readonly subject = Subjects.OrderExpired;
  queueGroupName = ticketsOrderConvergenceConsumer;

  async onMessage(
    data: OrderExpiredEvent["data"],
    msg: Message,
  ): Promise<void> {
    handleOrderConvergenceMessage("order.expired", data, msg);
  }
}
