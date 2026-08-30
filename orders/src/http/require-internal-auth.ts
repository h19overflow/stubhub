import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

const requireInternalAuth: RequestHandler = (request, response, next) => {
  const authorization = request.get("authorization");
  const match = authorization
    ? /^Bearer ([^\s]+)$/.exec(authorization)
    : null;
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  const authenticated =
    match &&
    expected &&
    timingSafeEqual(digest(match[1]), digest(expected));

  if (!authenticated) {
    response.status(401).json({
      error: "Internal authentication required",
      code: "internal_authentication_required",
    });
    return;
  }

  next();
};

export { requireInternalAuth };
