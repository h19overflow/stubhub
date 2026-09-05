import nats from "node-nats-streaming";
import { randomBytes } from "node:crypto";
import { TicketCreatedListener } from "./events/ticket-created-listener.js";

// 1. Connect to NATS Streaming (Cluster ID: 'ticketing', Client ID: unique random string)
const client = nats.connect("ticketing", randomBytes(4).toString("hex"), {
  url: process.env.NATS_URL || "http://localhost:4222",
});

client.on("connect", () => {
  console.log("Listener connected to NATS");

  client.on("close", () => {
    console.log("NATS connection closed");
    process.exit();
  });

  new TicketCreatedListener(client).listen();
});

// Listen for termination signals to cleanly disconnect and release durable lock
process.on("SIGINT", () => client.close());
process.on("SIGTERM", () => client.close());
