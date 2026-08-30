import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

/**
 * SHA-256 digest helper for timing-safe internal token comparison.
 *
 * Flow: used by requireInternalAuth to hash both presented and expected tokens
 * before timingSafeEqual, so raw token bytes never compared with early-exit string ===.
 */
function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Guards /internal/* routes — only Orders (INTERNAL_SERVICE_TOKEN) may call them.
 *
 * Flow: parses Authorization: Bearer <token>, expects env INTERNAL_SERVICE_TOKEN,
 * compares via timingSafeEqual(digest(presented), digest(expected)) → 401
 * internal_authentication_required on missing/mismatch; else next(). Prevents
 * browsers from directly reserving/releasing tickets.
 */
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
