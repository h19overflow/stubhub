import { z } from "zod";
import { AppError } from "../http/app-error.js";
import { internalRequest } from "./internal-request.js";

const baseUrl = process.env.IDENTITY_SERVICE_URL ?? "http://identity:3001";

const exactUserResponseSchema = z
  .object({
    user: z
      .object({
        userId: z.uuid(),
        email: z.email(),
      })
      .strict(),
  })
  .strict();

type ExactUser = z.infer<typeof exactUserResponseSchema>["user"];

/**
 * Fetches one reported user's email for the immutable report-time snapshot.
 * Identity's 404 is a business absence; network and malformed responses stay
 * retryable and are never converted into an empty or synthetic user.
 */
async function getExactUser(userId: string): Promise<ExactUser> {
  const response = await internalRequest(
    baseUrl,
    `/internal/users/${encodeURIComponent(userId)}`,
  );
  const body = await response.json().catch(() => null);
  if (response.status === 404) {
    throw new AppError(404, "user_not_found", "User not found");
  }
  if (!response.ok) {
    throw new AppError(
      503,
      "dependency_unavailable",
      "Identity service is unavailable",
    );
  }

  const parsed = exactUserResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      503,
      "dependency_unavailable",
      "Identity service is unavailable",
    );
  }
  return parsed.data.user;
}

export { getExactUser };
export type { ExactUser };
