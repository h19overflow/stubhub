# Event Bus and Message Broker Overview

**Status:** Redis Streams selected for the current learning implementation.

This overview compares four established production options: Apache Kafka,
RabbitMQ, NATS with JetStream, and Redis Streams.

## Important ordering decision

Define the communication requirements before selecting a broker:

- Must events be replayable?
- Is ordering required, and for which business entity?
- Does every consumer receive a copy, or should only one worker process it?
- How long must messages remain available?
- How are duplicates, delayed results, and unavailable consumers handled?

The broker should satisfy these decisions rather than determine them.

## Comparison

| Option | Main model | Replay | Operational weight | Best fit |
|---|---|---|---|---|
| Apache Kafka | Distributed retained event log | First-class | Highest here | Long-lived streams, analytics, rebuilding read models, and very high throughput |
| RabbitMQ | Exchanges and queues | Not with ordinary queues; RabbitMQ Streams add it | Moderate | Work queues, commands, flexible routing, retries, and service notifications |
| NATS with JetStream | Subject messaging with durable streams | Supported | Low | Lightweight microservice messaging, request/reply, and durable event delivery |
| Redis Streams | Append-only streams inside Redis | Supported | Low when Redis is already operated | Moderate-scale durable messaging, consumer groups, and simple read-model updates |

## Apache Kafka

Choose Kafka when event history is a central product requirement:

- consumers must replay old events;
- read models must be rebuilt from retained streams;
- throughput is very high; or
- analytics and stream processing are important.

Kafka is powerful, but it is usually more infrastructure than this ticketing
exercise currently requires.

## RabbitMQ

Choose RabbitMQ when the system mainly needs classic messaging:

- route messages to one or several queues;
- distribute work between workers;
- acknowledge successful processing;
- retry or dead-letter failed work; or
- use flexible exchange and binding rules.

RabbitMQ is a strong choice for learning traditional broker, queue, and routing
concepts.

## NATS with JetStream

Choose NATS when a small operational footprint is important:

- services communicate through subjects;
- request/reply and publish/subscribe are both useful;
- durable messages and replay are needed without Kafka's operational weight; or
- local development should remain simple.

Core NATS alone is transient and at-most-once. JetStream must be used when
messages need durability, acknowledgements, offline consumers, or replay.

## Redis

Redis has two different messaging features:

| Redis feature | Delivery behavior | Suitable use |
|---|---|---|
| Pub/Sub | At-most-once and not retained; disconnected consumers miss messages | Ephemeral notifications and cache invalidation |
| Streams | Retained entries, consumer groups, acknowledgements, pending entries, and replay | Durable service messaging and work distribution |

Redis Pub/Sub should not carry critical Order, payment, or reservation facts.
Redis Streams is a valid production option when its delivery and retention limits
fit the system.

Redis Streams is less specialized than Kafka or RabbitMQ. Production operation
still requires deliberate persistence, replication, trimming, pending-message
recovery, and isolation from unrelated cache workloads.

Redis is selected here as a deliberate learning choice, not because it is
universally better than a dedicated broker.

## Public Deriv evidence

Deriv's public `perl-Myriad` microservices framework provides Redis
implementations for RPC, subscriptions, storage, and service coordination. Its
Redis subscription implementation uses Redis Streams operations, consumer
groups, and acknowledgements.

This is evidence that Deriv has built public microservice tooling around Redis
Streams. It does not prove that every Deriv production system uses Redis or that
Redis is its only internal messaging technology.

## Current project fit

Redis Streams is selected for the current project.

Reasons:

- it keeps the local learning setup small;
- it provides durable streams, consumer groups, acknowledgements, pending-entry
  recovery, and replay;
- Deriv's public Myriad framework provides a relevant Redis Streams example; and
- it teaches the delivery and idempotency concepts needed before learning Kafka.

Redis Pub/Sub is not used for durable business facts. This choice can be
revisited if retained high-throughput event history, complex routing, or another
concrete requirement exceeds Redis Streams.

Do not use the event bus to make immediate reservation, payment-eligibility, or
expiration decisions authoritative. Those decisions remain inside their owning
services.

Regardless of broker, consumers must handle duplicate and late delivery safely.
No broker removes the need for idempotency and guarded state transitions.

## Official references

- [Apache Kafka introduction](https://kafka.apache.org/intro/)
- [RabbitMQ AMQP concepts](https://www.rabbitmq.com/tutorials/amqp-concepts)
- [NATS JetStream concepts](https://docs.nats.io/nats-concepts/jetstream)
- [Redis Pub/Sub delivery semantics](https://redis.io/docs/latest/develop/pubsub/)
- [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/)
- [Deriv Myriad microservices framework](https://github.com/deriv-com/perl-Myriad)
- [Deriv Myriad Redis Streams subscription implementation](https://github.com/deriv-com/perl-Myriad/blob/master/lib/Myriad/Subscription/Implementation/Redis.pm)
