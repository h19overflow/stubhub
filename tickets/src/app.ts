import express from "express";
import { getTicket } from "./http/routes/get-ticket.js";
import { listMyTickets } from "./http/routes/list-my-tickets.js";
import { listTickets } from "./http/routes/list-tickets.js";
import { errorHandler } from "./http/error-handler.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_request, response) => {
  response.json({ service: "tickets", status: "ok" });
});

app.use(listTickets, listMyTickets, getTicket);

app.use(errorHandler);

export { app };
