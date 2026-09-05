/**
 * Known NATS Streaming event subjects (channels) used across services.
 * Acts as the single source of truth for channel names.
 */
export enum Subjects {
 TicketCreated = "ticket:created",
 TicketUpdated = "ticket:updated",
}

/**
 * Base contract for any event in the system.
 * Every domain event binds a specific Subject to its payload data type.
 */
export interface Event {
 subject: Subjects;
 data: unknown;
}
