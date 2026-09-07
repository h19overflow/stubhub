import type {
  Message,
  Stan,
  Subscription,
  SubscriptionOptions,
} from "node-nats-streaming";
import type { Event } from "./types/subjects.js";

/**
 * Optional configuration for customizing a Listener's behavior.
 * Passed to the constructor.
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
  /** Max delivery attempts before treating an unhandled failure as a poison pill. Default: 5. */
  maxRetries?: number;
}

/**
 * Abstract base listener that encapsulates NATS Streaming subscription mechanics.
 *
 * Subclasses define domain specifics (`subject`, `queueGroupName`, `onMessage`),
 * while transport boilerplate (subscription options, message parsing, durable names)
 * is managed here with sensible defaults that can be overridden at class or instance level.
 *
 * @template T - Domain event contract defining the expected subject and payload type.
 */
export abstract class Listener<T extends Event> {
  /** The subject/channel name to subscribe to. */
  abstract subject: T["subject"];

  /** The queue group name for load-balancing across instances. */
  abstract queueGroupName: string;

  /** Handler invoked when a message is received and successfully parsed. */
  abstract onMessage(data: T["data"], msg: Message): void | Promise<void>;

  /** The active NATS Streaming connection handle. */
  protected client: Stan;

  /** Timeout in milliseconds before unacknowledged messages are redelivered. Default: 5000ms. */
  protected ackWait = 5000;

  /** Whether manual message acknowledgment is required. Default: true. */
  protected manualAck = true;

  /** Whether to replay historical messages on initial subscription startup. Default: true. */
  protected deliverAllAvailable = true;

  /** Max unacknowledged messages allowed concurrently by NATS. Default: undefined. */
  protected maxInFlight?: number;

  /** Optional override for the durable name. Defaults to `queueGroupName` when omitted. */
  protected durableName?: string;

  /** Max delivery attempts before treating an unhandled failure as a poison pill. Default: 5. */
  protected maxRetries = 5;

  /** In-memory tracking of message delivery attempts by sequence number. */
  private deliveryAttempts = new Map<number, number>();

  /** The active subscription handle if listening. */
  protected subscription?: Subscription;

  /** Active in-flight processing promises for graceful shutdown draining. */
  private inFlight = new Set<Promise<void>>();

  constructor(client: Stan, options?: ListenerOptions) {
    this.client = client;

    if (options?.ackWait !== undefined) this.ackWait = options.ackWait;
    if (options?.manualAck !== undefined) this.manualAck = options.manualAck;
    if (options?.deliverAllAvailable !== undefined) {
      this.deliverAllAvailable = options.deliverAllAvailable;
    }
    if (options?.maxInFlight !== undefined) {
      this.maxInFlight = options.maxInFlight;
    }
    if (options?.durableName !== undefined) {
      this.durableName = options.durableName;
    }
    if (options?.maxRetries !== undefined) {
      this.maxRetries = options.maxRetries;
    }
  }

  /**
   * Builds the NATS SubscriptionOptions using default fields.
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
   * @returns The active NATS Subscription instance.
   */
  listen(): Subscription {
    const subscription = this.client.subscribe(
      this.subject,
      this.queueGroupName,
      this.subscriptionOptions(),
    );
    this.subscription = subscription;
    subscription.on("message", (msg: Message) => {
      const handlerPromise = this.handleMessage(msg).catch((err) => {
        console.error(
          `Unhandled error in listener for ${this.subject} / ${this.queueGroupName}:`,
          err,
        );
      });
      this.inFlight.add(handlerPromise);
      void handlerPromise.finally(() => {
        this.inFlight.delete(handlerPromise);
      });
    });

    return subscription;
  }

  /**
   * Internal message handler logic with poison detection and retry tracking.
   */
  private async handleMessage(msg: Message): Promise<void> {
    console.log(`Message received: ${this.subject} / ${this.queueGroupName}`);
    const sequence = msg.getSequence();

    let parsedData: T["data"];
    try {
      parsedData = this.parseMessage(msg);
    } catch (parseErr) {
      console.error(
        `[Poison Message] Failed to parse message on ${this.subject} (seq: ${sequence}):`,
        parseErr,
      );
      this.deliveryAttempts.delete(sequence);
      try {
        await this.onPoisonMessage(msg, parseErr);
      } catch (poisonErr) {
        console.error(
          `Failed to execute onPoisonMessage on ${this.subject}:`,
          poisonErr,
        );
      }
      return;
    }

    try {
      await this.onMessage(parsedData, msg);
      this.deliveryAttempts.delete(sequence);
    } catch (err) {
      const attempts = (this.deliveryAttempts.get(sequence) ?? 0) + 1;
      this.deliveryAttempts.set(sequence, attempts);
      if (this.deliveryAttempts.size > 5_000) {
        const oldestKey = this.deliveryAttempts.keys().next().value;
        if (oldestKey !== undefined) this.deliveryAttempts.delete(oldestKey);
      }
      console.error(
        `Error processing message on ${this.subject} (seq: ${sequence}, attempt: ${attempts}/${this.maxRetries}):`,
        err,
      );

      if (attempts >= this.maxRetries) {
        console.error(
          `[Max Retries Exceeded] Poison message abandoned on ${this.subject} (seq: ${sequence}) after ${attempts} attempts`,
        );
        this.deliveryAttempts.delete(sequence);
        try {
          await this.onPoisonMessage(msg, err);
        } catch (poisonErr) {
          console.error(
            `Failed to execute onPoisonMessage on ${this.subject}:`,
            poisonErr,
          );
        }
      }
    }
  }

  /**
   * Extracts and deserializes the payload from the incoming NATS message.
   * Defaults to JSON parsing of string or UTF-8 Buffer data.
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

  /**
   * Handles messages that cannot be parsed or exceed max retries.
   * Default behavior logs a fatal warning and acknowledges the message to prevent
   * infinite queue stalls. Subclasses may override to route to a dead-letter channel.
   */
  async onPoisonMessage(msg: Message, error: unknown): Promise<void> {
    console.error(
      `[DLQ/Poison Handler] Acknowledging poison message seq ${msg.getSequence()} on ${this.subject}:`,
      error,
    );
    if (this.manualAck) {
      msg.ack();
    }
  }

  /**
   * Awaits all currently in-flight message handlers up to a bounded timeout.
   */
  async drain(timeoutMs = 10_000): Promise<void> {
    if (this.inFlight.size === 0) return;
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    try {
      await Promise.race([
        Promise.allSettled(Array.from(this.inFlight)),
        timeoutPromise,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Closes the subscription and gracefully drains any in-flight handlers.
   */
  async close(drainTimeoutMs = 10_000): Promise<void> {
    if (this.subscription) {
      this.subscription.close();
      this.subscription = undefined;
    }
    await this.drain(drainTimeoutMs);
  }
}
