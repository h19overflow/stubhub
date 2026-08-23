import type { RequestHandler } from "express";

const WINDOW_MS = 60_000;
const REQUEST_LIMIT = 15;
const buckets = new Map<string, { count: number; resetAt: number }>();

// ponytail: process-local fixed windows fit the single Identity pod; use Redis before adding replicas.
const authRateLimit: RequestHandler = (request, response, next) => {
  const now = Date.now();
  const key = `${request.method}:${request.path}:${request.ip}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  if (bucket.count >= REQUEST_LIMIT) {
    response.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1_000).toString());
    response.status(429).json({ error: "Too many requests. Try again later" });
    return;
  }

  bucket.count += 1;
  next();
};

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, WINDOW_MS).unref();

export { authRateLimit };
