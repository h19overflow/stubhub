/**
 * Central error handler for Identity — maps thrown HttpErrors to JSON and hides internals.
 *
 * Flow: all routes throw HttpError for expected failures; parser errors (400 malformed JSON)
 * are caught first; HttpError → its status+message; otherwise 500 generic + console.error.
 * Must be last middleware (app.ts) and respects headersSent.
 */
import type { ErrorRequestHandler } from "express";
import { HttpError } from "@stubhub/common";

// Express recognizes error-handling middleware by its four parameters. Express 5
// forwards errors thrown by synchronous or async route handlers to this function.
const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  // Once a response has started, sending another response would fail. Delegating
  // lets Express (or another error handler) finish or close the response safely.
  if (response.headersSent) {
    next(error);
    return;
  }

  const parserError = error as { status?: unknown; type?: unknown };
  if (parserError.status === 400 && parserError.type === "entity.parse.failed") {
    if (request.path === "/admin/users/elevate") {
      response.status(400).json({ error: "A valid email is required", code: "invalid_email" });
    } else {
      response.status(400).json({ error: "Malformed JSON body" });
    }
    return;
  }

  // Expected route error: expose the status and deliberately client-safe message.
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message });
    return;
  }

  // Elevation clients need a stable machine-readable failure code; other routes
  // retain the existing generic envelope.
  console.error(error);
  if (request.path === "/admin/users/elevate") {
    response.status(500).json({ error: "Internal server error", code: "internal_error" });
  } else {
    response.status(500).json({ error: "Internal server error" });
  }
};

export { errorHandler, HttpError };
