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
