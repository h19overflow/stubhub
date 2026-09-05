import type { Message } from "node-nats-streaming";
import { Listener } from "./base-listener.js";
import type { TicketCreatedEvent } from "./ticket-created-event.js";
import { Subjects } from "./subjects.js";

/**
 * Concrete listener for consuming `ticket:created` events from NATS Streaming.
 *
 * Inherits default subscription behavior (`manualAck = true`, `ackWait = 5000`,
 * `deliverAllAvailable = true`), and acknowledges messages after successful processing.
 */
export class TicketCreatedListener extends Listener<TicketCreatedEvent> {
 readonly subject = Subjects.TicketCreated;
 queueGroupName = "tickets-service-queue-group";

 onMessage(data: TicketCreatedEvent["data"], msg: Message): void {
  console.log("Received event on", this.subject, data);
  msg.ack();
 }
}
