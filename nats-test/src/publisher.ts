import nats from "node-nats-streaming";
import { TicketCreatedPublisher } from "./events/ticket-created-publisher.js";

// 1. Connect to NATS Streaming (Cluster ID: 'ticketing', Client ID: 'publisher-1')
const client = nats.connect("ticketing", "publisher-1", {
  url: process.env.NATS_URL || "http://localhost:4222",
});

// 2. Publish event once connected
client.on("connect", async () => {
  console.log("Publisher connected to NATS");

  const publisher = new TicketCreatedPublisher(client);

  try {
    await publisher.publish({
      id: "123",
      title: "Concert Tour",
      price: 50,
    });
  } catch (err) {
    console.error("Failed to publish event:", err);
  }
});
