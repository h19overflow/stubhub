import type { RequestHandler } from "express";
import type { AuthenticatedUser } from "@stubhub/common";

const requireAdmin: RequestHandler = (_request, response, next) => {
  const user = response.locals.user as AuthenticatedUser | undefined;
  if (!user || user.role !== "admin") {
    response.status(403).json({
      error: "Administrator access required",
      code: "administrator_required",
    });
    return;
  }
  next();
};

export { requireAdmin };
