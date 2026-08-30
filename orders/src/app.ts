import express from "express";
import type { ErrorRequestHandler } from "express";
import { createOrder } from "./http/routes/create-order.js";
import { listOrders } from "./http/routes/list-orders.js";
import { submitPayment } from "./http/routes/submit-payment.js";
import { reportContext } from "./http/routes/report-context.js";
import { AppError } from "./http/app-error.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_request, response) => {
  response.json({ service: "orders", status: "ok" });
});
app.use(createOrder, submitPayment, listOrders, reportContext);

const errors: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
    });
    return;
  }
  if (error instanceof SyntaxError) {
    let code = "invalid_order";
    if (request.path.endsWith("/payments")) {
      code = "invalid_payment";
    } else if (request.path.startsWith("/internal/orders/report-context")) {
      code = "invalid_report_context";
    }
    response.status(400).json({
      error: "Invalid JSON request",
      code,
    });
    return;
  }

  console.error("Orders request failed", error);
  response.status(500).json({
    error: "Internal server error",
    code: "internal_error",
  });
};

app.use(errors);

export { app };
