import type { RequestHandler } from "express";

type AuthenticatedRole = { role?: unknown };

/**
 * Allows only the administrator established by requireAuth's verified JWT.
 * The request body, query, and path never provide caller identity or role.
 */
const requireAdmin: RequestHandler = (_request, response, next) => {
  const user = response.locals.user as AuthenticatedRole | undefined;
  if (user?.role !== "admin") {
    response.status(403).json({
      error: "Administrator required",
      code: "administrator_required",
    });
    return;
  }

  next();
};

export { requireAdmin };
