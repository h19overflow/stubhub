import type {
  Message,
  Stan,
  Subscription,
  SubscriptionOptions,
} from "node-nats-streaming";
import type { Event } from "./subjects.js";

/**
 * Optional configuration for customizing a Listener's behavior.
 * Passed to the constructor (equivalent to Python's `__init__` kwargs).
 */
export interface ListenerOptions {
  /** Timeout in milliseconds before unacknowledged messages are redelivered. */
  ackWait?: number;
  /** Whether manual message acknowledgment is required. */
  manualAck?: boolean;
  /** Whether to replay historical messages on initial subscription startup. */
  deliverAllAvailable?: boolean;
  /** Max unacknowledged messages allowed concurrently by NATS. */
  maxInFlight?: number;
  /** Optional override for the durable name. Defaults to `queueGroupName` when omitted. */
  durableName?: string;
}

/**
 * Abstract base listener that encapsulates NATS Streaming subscription mechanics.
 *
 * Subclasses define the domain specifics (`subject`, `queueGroupName`, `onMessage`),
 * while all transport boilerplate (subscription options, message parsing, durable names)
 * is managed here with sensible defaults that can be overridden either:
 *  1. At the class level (as class property defaults)
 *  2. At the instance level (via constructor options, like Python's `__init__`)
 *
 * @template T - Domain event contract defining the expected subject and payload type.
 */
export abstract class Listener<T extends Event> {
  /** The subject/channel name to subscribe to. */
  abstract subject: T["subject"];

  /** The queue group name for load-balancing across instances. */
  abstract queueGroupName: string;

  /** Handler invoked when a message is received and successfully parsed. */
  abstract onMessage(data: T["data"], msg: Message): void;

  /** The active NATS Streaming connection handle. */
  protected client: Stan;

  /** Timeout in milliseconds before unacknowledged messages are redelivered. Default: 5000ms. */
  protected ackWait = 5000;

  /** Whether manual message acknowledgment is required. Default: true. */
  protected manualAck = true;

  /** Whether to replay historical messages on initial subscription startup. Default: true. */
  protected deliverAllAvailable = true;

  /** Max unacknowledged messages allowed concurrently by NATS. Default: undefined (broker default). */
  protected maxInFlight?: number;

  /** Optional override for the durable name. Defaults to `queueGroupName` when omitted. */
  protected durableName?: string;

  constructor(client: Stan, options?: ListenerOptions) {
    this.client = client;

    if (options?.ackWait !== undefined) this.ackWait = options.ackWait;
    if (options?.manualAck !== undefined) this.manualAck = options.manualAck;
    if (options?.deliverAllAvailable !== undefined) {
      this.deliverAllAvailable = options.deliverAllAvailable;
    }
    if (options?.maxInFlight !== undefined)
      this.maxInFlight = options.maxInFlight;
    if (options?.durableName !== undefined)
      this.durableName = options.durableName;
  }

  /**
   * Builds the NATS SubscriptionOptions using default fields.
   * Override this method if you need custom replay positioning (e.g. sequence numbers or timestamps).
   */
  subscriptionOptions(): SubscriptionOptions {
    const opts = this.client
      .subscriptionOptions()
      .setAckWait(this.ackWait)
      .setDurableName(this.durableName ?? this.queueGroupName);

    if (this.manualAck) {
      opts.setManualAckMode(true);
    }

    if (this.deliverAllAvailable) {
      opts.setDeliverAllAvailable();
    }

    if (this.maxInFlight !== undefined) {
      opts.setMaxInFlight(this.maxInFlight);
    }

    return opts;
  }

  /**
   * Establishes the subscription to NATS Streaming and starts listening for events.
   *
   * @returns The active NATS Subscription instance, allowing callers to manage lifecycle (close/unsubscribe).
   */
  listen(): Subscription {
    const subscription = this.client.subscribe(
      this.subject,
      this.queueGroupName,
      this.subscriptionOptions(),
    );

    subscription.on("message", (msg: Message) => {
      console.log(`Message received: ${this.subject} / ${this.queueGroupName}`);

      try {
        const parsedData = this.parseMessage(msg);
        this.onMessage(parsedData, msg);
      } catch (err) {
        console.error("Error processing message on", this.subject, err);
      }
    });

    return subscription;
  }

  /**
   * Extracts and deserializes the payload from the incoming NATS message.
   * Defaults to JSON parsing of string or UTF-8 Buffer data.
   *
   * @throws Error if the raw message cannot be parsed as valid JSON.
   */
  parseMessage(msg: Message): T["data"] {
    const data = msg.getData();
    const raw = typeof data === "string" ? data : data.toString("utf8");
    try {
      return JSON.parse(raw) as T["data"];
    } catch (err) {
      throw new Error(`Failed to parse message payload: ${err}`);
    }
  }
}
