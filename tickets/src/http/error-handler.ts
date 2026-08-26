import type { ErrorRequestHandler } from "express";
import multer from "multer";

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const parserError = error as { status?: unknown; type?: unknown };
  if (parserError.status === 400 && parserError.type === "entity.parse.failed") {
    response.status(400).json({ error: "Malformed JSON body" });
    return;
  }

  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    response.status(status).json({ error: error.message });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error" });
};

export { errorHandler, HttpError };
