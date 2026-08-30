import { Router } from "express";
import { requireAuth } from "@stubhub/common";
import { requireAdmin } from "../require-admin.js";
import { adminElevationSchema } from "../schemas.js";
import { elevateUserByEmail } from "../../users/user-repo.js";

const router = Router();

/**
 * POST /admin/users/elevate — elevates one existing account to admin.
 * Authentication and authorization come only from the verified access JWT.
 */
router.post("/admin/users/elevate", requireAuth, requireAdmin, (request, response) => {
  const input = adminElevationSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: "A valid email is required", code: "invalid_email" });
    return;
  }

  const user = elevateUserByEmail(input.data.email);
  if (!user) {
    response.status(404).json({ error: "User not found", code: "user_not_found" });
    return;
  }

  response.status(200).json({
    user: {
      userId: user.id,
      email: user.email,
      role: "admin",
    },
  });
});

export { router as adminUsers };
