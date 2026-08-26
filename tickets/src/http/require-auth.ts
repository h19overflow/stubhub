import type { RequestHandler } from "express";
import { verifyAccessToken } from "../tokens/access-token.js";

const requireAuth: RequestHandler = async (request, response, next) => {
  const user = await verifyAccessToken(request.headers.authorization);
  if (!user) {
    response.setHeader("WWW-Authenticate", "Bearer");
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  response.locals.user = user;
  next();
};

export { requireAuth };
