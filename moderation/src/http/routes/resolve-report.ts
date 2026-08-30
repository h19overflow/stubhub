import { Router } from "express";
import { requireAuth, type AuthenticatedUser } from "@stubhub/common";
import { AppError } from "../app-error.js";
import { resolutionRequestSchema } from "../schemas.js";
import { requireAdmin } from "../require-admin.js";
import { resolveReport as runResolveReport } from "../../reports/report-workflow.js";
import { z } from "zod";

const router = Router();

router.post(
  "/admin/reports/:reportId/resolve",
  requireAuth,
  requireAdmin,
  async (request, response, next) => {
    try {
      const reportId = z.uuid().safeParse(request.params.reportId);
      const body = resolutionRequestSchema.safeParse(request.body);
      if (!reportId.success || !body.success) {
        throw new AppError(
          400,
          "invalid_resolution",
          "Invalid resolution request",
        );
      }

      const user = response.locals.user as AuthenticatedUser;
      const report = runResolveReport({
        reportId: reportId.data,
        decision: body.data.decision,
        reason: body.data.reason,
        resolvedByUserId: user.id,
      });
      response.json({ report });
    } catch (error) {
      next(error);
    }
  },
);

export { router as resolveReport };
