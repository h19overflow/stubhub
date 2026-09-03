import nats, { Message } from 'node-nats-streaming'
import { randomBytes } from 'node:crypto'

// 1. Connect to NATS Streaming (Cluster ID: 'ticketing', Client ID: unique random string)
const client = nats.connect('ticketing', randomBytes(4).toString('hex'), {
  url: process.env.NATS_URL || 'http://localhost:4222',
})

client.on('connect', () => {
  console.log('Listener connected to NATS')

  // 2. Configure Subscription Options
  const options = client
    .subscriptionOptions()
    // Manual ACK: we must call msg.ack() manually when processing succeeds
    .setManualAckMode(true)
    // Redelivery timeout: re-sends message if not acknowledged within 5 seconds
    .setAckWait(5000)
    // Redeliver all past historical messages on initial startup
    .setDeliverAllAvailable()
    // Durable name: NATS tracks which events this service has already acknowledged,
    // so restarts won't re-process events that were already handled
    .setDurableName('tickets-service')

  // 3. Subscribe with Channel, Queue Group, and Options
  // - Channel: 'ticket:created'
  // - Queue Group: 'tickets-service-queue-group' (balances load across multiple listener instances)
  const subscription = client.subscribe(
    'ticket:created',
    'tickets-service-queue-group',
    options
  )

  // 4. Handle incoming events
  subscription.on('message', (msg: Message) => {
    const data = msg.getData()
    console.log(`[#${msg.getSequence()}] Received event:`, data)

    // Acknowledge the message so NATS marks it as successfully processed
    msg.ack()
  })
})

// Graceful shutdown: exit process when connection closes
client.on('close', () => {
  console.log('NATS connection closed')
  process.exit()
})

// Listen for termination signals to cleanly disconnect and release durable lock
process.on('SIGINT', () => client.close())
process.on('SIGTERM', () => client.close())
