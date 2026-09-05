// pi-lens-ignore: ts:2305
import { Publisher, Subjects, type OrderExpiredEvent } from "@stubhub/common";

/**
 * Concrete publisher for emitting `order:expired` events to NATS Streaming.
 */
export class OrderExpiredPublisher extends Publisher<OrderExpiredEvent> {
 readonly subject = Subjects.OrderExpired;
}
