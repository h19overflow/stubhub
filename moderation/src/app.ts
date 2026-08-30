import express, { type ErrorRequestHandler } from "express";
import { AppError } from "./http/app-error.js";
import { createReport } from "./http/routes/create-report.js";
import { listReportedUsers } from "./http/routes/list-reported-users.js";
import { resolveReport } from "./http/routes/resolve-report.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_request, response) => {
  response.json({ service: "moderation", status: "ok" });
});

app.use(createReport, listReportedUsers, resolveReport);

const errors: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
    });
    return;
  }
  if (error instanceof SyntaxError) {
    const code = request.path.endsWith("/resolve")
      ? "invalid_resolution"
      : "invalid_report";
    response.status(400).json({
      error: "Invalid JSON request",
      code,
    });
    return;
  }

  console.error("Moderation request failed", error);
  response.status(500).json({
    error: "Internal server error",
    code: "internal_error",
  });
};

app.use(errors);

export { app };
