import type { Stan } from "node-nats-streaming";
import type { Event } from "./types/subjects.js";

/**
 * Abstract base publisher that encapsulates NATS Streaming event emission.
 *
 * Subclasses define the domain event `subject`, while serialization and
 * asynchronous promise handling are handled behind a concise interface.
 *
 * @template T - Domain event contract defining the expected subject and payload type.
 */
export abstract class Publisher<T extends Event> {
 /** The subject/channel name to publish events to. */
 abstract subject: T["subject"];

 /** The active NATS Streaming connection handle. */
 protected client: Stan;

 constructor(client: Stan) {
  this.client = client;
 }

 /**
  * Publishes an event to the configured NATS Streaming subject.
  *
  * Wraps the asynchronous NATS callback in a Promise, resolving with the server-assigned
  * message GUID or rejecting on transport error.
  *
  * @param data - The event payload conforming to the event contract.
  * @returns A promise resolving to the published message GUID.
  */
 publish(data: T["data"]): Promise<string> {
  return new Promise((resolve, reject) => {
   this.client.publish(this.subject, JSON.stringify(data), (err, guid) => {
    if (err) {
     return reject(err);
    }
    resolve(guid);
   });
  });
 }
}
