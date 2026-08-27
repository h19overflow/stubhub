import express from "express";
import { createOrder } from "./http/routes/create-order.js";
import { listOrders } from "./http/routes/list-orders.js";
import { submitPayment } from "./http/routes/submit-payment.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_request, response) => {
  response.json({ service: "orders", status: "ok" });
});

app.use(createOrder, submitPayment, listOrders);

export { app };
