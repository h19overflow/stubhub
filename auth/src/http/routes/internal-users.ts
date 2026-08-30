import { Router } from "express";
import { requireInternalAuth } from "../require-internal-auth.js";
import { userIdSchema } from "../schemas.js";
import { findUserById } from "../../users/user-repo.js";

const router = Router();
router.use("/internal", requireInternalAuth);

/**
 * GET /internal/users/:userId — returns the minimum exact Identity snapshot.
 * Invalid identifiers and misses never fall through to a user list.
 */
router.get<{ userId: string }>("/internal/users/:userId", (request, response) => {
  const userId = userIdSchema.safeParse(request.params.userId);
  if (!userId.success) {
    response.status(400).json({ error: "Invalid user ID", code: "invalid_user_id" });
    return;
  }

  const user = findUserById(userId.data);
  if (!user) {
    response.status(404).json({ error: "User not found", code: "user_not_found" });
    return;
  }

  response.status(200).json({
    user: {
      userId: user.id,
      email: user.email,
    },
  });
});

export { router as internalUsers };
