import { Publisher } from "./base-publisher.js";
import type { TicketCreatedEvent } from "./ticket-created-event.js";
import { Subjects } from "./subjects.js";

/**
 * Concrete publisher for emitting `ticket:created` events to NATS Streaming.
 *
 * Inherits default JSON serialization and Promise-based publishing from `Publisher`.
 */
export class TicketCreatedPublisher extends Publisher<TicketCreatedEvent> {
 readonly subject = Subjects.TicketCreated;
}
