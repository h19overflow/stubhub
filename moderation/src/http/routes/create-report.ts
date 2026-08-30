import { Router } from "express";
import { requireAuth, type AuthenticatedUser } from "@stubhub/common";
import { AppError } from "../app-error.js";
import { idempotencyKeySchema, reportRequestSchema } from "../schemas.js";
import { createReport as runCreateReport } from "../../reports/report-workflow.js";

const router = Router();

router.post("/reports", requireAuth, async (request, response, next) => {
  try {
    const body = reportRequestSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, "invalid_report", "Invalid report request");
    }

    const rawKey = request.headers["idempotency-key"];
    const idempotencyHeaderCount = request.rawHeaders.filter(
      (name, index) =>
        index % 2 === 0 && name.toLowerCase() === "idempotency-key",
    ).length;
    const idempotencyKey = idempotencyKeySchema.safeParse(
      idempotencyHeaderCount === 1 && typeof rawKey === "string"
        ? rawKey
        : undefined,
    );
    if (!idempotencyKey.success) {
      throw new AppError(
        400,
        "invalid_report",
        "A valid Idempotency-Key header is required",
      );
    }

    const user = response.locals.user as AuthenticatedUser;
    const report = await runCreateReport({
      reporterUserId: user.id,
      orderId: body.data.orderId,
      reportedUserId: body.data.reportedUserId,
      reason: body.data.reason,
      idempotencyKey: idempotencyKey.data,
    });
    response.status(201).json({ report });
  } catch (error) {
    next(error);
  }
});

export { router as createReport };
