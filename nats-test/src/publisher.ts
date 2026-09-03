import nats from 'node-nats-streaming'

// 1. Connect to NATS Streaming (Cluster ID: 'ticketing', Client ID: 'publisher-1')
const client = nats.connect('ticketing', 'publisher-1', {
  url: process.env.NATS_URL || 'http://localhost:4222',
})

// 2. Publish event once connected
client.on('connect', () => {
  console.log('Publisher connected to NATS')

  const ticket = {
    id: '123',
    title: 'Concert Tour',
    price: 50,
  }

  // 3. Publish to 'ticket:created' channel
  client.publish('ticket:created', JSON.stringify(ticket), (err) => {
    if (err) {
      console.error('Failed to publish event:', err)
      return
    }
    console.log('Event published:', ticket)
  })
})
