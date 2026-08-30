/**
 * Central error handler for Identity — maps thrown HttpErrors to JSON and hides internals.
 *
 * Flow: all routes throw HttpError for expected failures; parser errors (400 malformed JSON)
 * are caught first; HttpError → its status+message; otherwise 500 generic + console.error.
 * Must be last middleware (app.ts) and respects headersSent.
 */
import type { ErrorRequestHandler } from "express";

// A route throws HttpError for an expected failure whose status and message are
// safe to return to the client, for example: throw new HttpError(404, "Not found").
class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    // Initialize the built-in Error fields, including `message` and the stack trace.
    super(message);
  }
}

// Express recognizes error-handling middleware by its four parameters. Express 5
// forwards errors thrown by synchronous or async route handlers to this function.
const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  // Once a response has started, sending another response would fail. Delegating
  // lets Express (or another error handler) finish or close the response safely.
  if (response.headersSent) {
    next(error);
    return;
  }

  const parserError = error as { status?: unknown; type?: unknown };
  if (parserError.status === 400 && parserError.type === "entity.parse.failed") {
    response.status(400).json({ error: "Malformed JSON body" });
    return;
  }

  // Expected route error: expose the status and deliberately client-safe message.
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message });
    return;
  }

  // Unexpected error: log the real error, but do not leak its internal details.
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
};

export { errorHandler, HttpError };
