import { Router } from "express";
import { findReportContext } from "../../orders/order-repo.js";
import { AppError } from "../app-error.js";
import { requireInternalAuth } from "../require-internal-auth.js";

const router = Router();
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseReportContextBody(body: unknown): {
  orderId: string;
  reporterUserId: string;
  reportedUserId: string;
} {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppError(400, "invalid_report_context", "Invalid report context");
  }

  const value = body as Record<string, unknown>;
  if (
    Object.keys(value).length !== 3 ||
    typeof value.orderId !== "string" ||
    typeof value.reporterUserId !== "string" ||
    typeof value.reportedUserId !== "string" ||
    !uuid.test(value.orderId) ||
    !uuid.test(value.reporterUserId) ||
    !uuid.test(value.reportedUserId)
  ) {
    throw new AppError(400, "invalid_report_context", "Invalid report context");
  }

  return {
    orderId: value.orderId,
    reporterUserId: value.reporterUserId,
    reportedUserId: value.reportedUserId,
  };
}

router.post(
  "/internal/orders/report-context",
  requireInternalAuth,
  (request, response) => {
    const command = parseReportContextBody(request.body);
    const reportContext = findReportContext(
      command.orderId,
      command.reporterUserId,
      command.reportedUserId,
    );
    if (!reportContext) {
      throw new AppError(
        404,
        "report_context_not_found",
        "Report context not found",
      );
    }
    response.status(200).json({ reportContext });
  },
);

export { router as reportContext };
