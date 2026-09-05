// pi-lens-ignore: ts:2305
import { Publisher, Subjects, type OrderCompletedEvent } from "@stubhub/common";

/**
 * Concrete publisher for emitting `order:completed` events to NATS Streaming.
 */
export class OrderCompletedPublisher extends Publisher<OrderCompletedEvent> {
 readonly subject = Subjects.OrderCompleted;
}
