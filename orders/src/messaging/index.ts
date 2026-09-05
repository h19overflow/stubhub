/**
 * Orders Messaging Subsystem (Deep Module)
 *
 * Implements durable event publishing using Transactional Outbox pattern
 * with NATS Streaming transport.
 *
 * Internally segmented into:
 * - types.ts: publication records and outbox schemas
 * - nats-client.ts: NATS Streaming connection management
 * - publishers/: strongly-typed event publishers (OrderCompletedPublisher, OrderExpiredPublisher)
 * - outbox-repo.ts: SQLite outbox staging, queries, and publication tracking
 * - outbox-dispatcher.ts: scheduled polling and NATS dispatching
 */

export * from "./types.js";
export * from "./publishers/index.js";
export {
 getNatsClient,
 closeNatsClient,
 closeNatsClient as closeOrderMessaging,
} from "./nats-client.js";
export {
 enqueueOrderFact,
 listDueOrderEventPublications,
 markOrderEventPublished,
 recordOrderEventPublicationFailure,
} from "./outbox-repo.js";
export {
 dispatchOutboxPublication,
 dispatchDueOrderEvents,
 dispatchDueOrderEvents as dispatchOutboxBatch,
} from "./outbox-dispatcher.js";
