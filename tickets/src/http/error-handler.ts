/**
 * Central error handler for Tickets — handles JSON parse, multer limits, and domain HttpErrors.
 *
 * Flow: malformed JSON → 400 invalid_reservation/invalid_price (by path); Multer
 * LIMIT_FILE_SIZE → 413 image_too_large; HttpError → its status+code; else 500.
 * Must be last middleware.
 */
import type { ErrorRequestHandler } from "express";
import multer from "multer";

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const parserError = error as { status?: unknown; type?: unknown };
  if (
    parserError.status === 400 &&
    parserError.type === "entity.parse.failed"
  ) {
    const code = request.path.startsWith("/internal/")
      ? "invalid_reservation"
      : "invalid_price";
    response.status(400).json({
      error: "Malformed JSON body",
      code,
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({
        error: "Image exceeds 5 MiB",
        code: "image_too_large",
      });
      return;
    }

    response.status(400).json({
      error: "Invalid ticket upload",
      code: "invalid_ticket",
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
    });
    return;
  }

  console.error(error);
  response.status(500).json({
    error: "Internal server error",
    code: "internal_error",
  });
};

export { errorHandler, HttpError };
