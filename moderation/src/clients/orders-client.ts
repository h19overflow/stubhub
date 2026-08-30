import { z } from "zod";
import { AppError } from "../http/app-error.js";
import { internalRequest } from "./internal-request.js";

const baseUrl = process.env.ORDERS_SERVICE_URL ?? "http://orders:3003";
const isoTimestamp = z.iso.datetime({ offset: true });

const reportContextResponseSchema = z
  .object({
    reportContext: z
      .object({
        orderId: z.uuid(),
        orderStatus: z.literal("complete"),
        reportedUserId: z.uuid(),
        ticket: z
          .object({
            ticketId: z.uuid(),
            eventName: z.string().min(1),
            description: z.string().min(1),
            eventStartsAt: isoTimestamp,
            eventEndsAt: isoTimestamp.nullable(),
            place: z.string().min(1),
            ticketInfo: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

type ReportContext = z.infer<typeof reportContextResponseSchema>["reportContext"];

/**
 * Asks Orders for the one authoritative completed-order reporting decision.
 * A 404 is a definitive business rejection; transport and malformed success
 * responses remain retryable dependency failures.
 */
async function getReportContext(
  orderId: string,
  reporterUserId: string,
  reportedUserId: string,
): Promise<ReportContext> {
  const response = await internalRequest(
    baseUrl,
    "/internal/orders/report-context",
    {
      method: "POST",
      body: JSON.stringify({ orderId, reporterUserId, reportedUserId }),
    },
  );
  const body = await response.json().catch(() => null);
  if (response.status === 404) {
    throw new AppError(
      404,
      "report_context_not_found",
      "Report context not found",
    );
  }
  if (!response.ok) {
    throw new AppError(
      503,
      "dependency_unavailable",
      "Orders service is unavailable",
    );
  }

  const parsed = reportContextResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      503,
      "dependency_unavailable",
      "Orders service is unavailable",
    );
  }
  return parsed.data.reportContext;
}

export { getReportContext };
export type { ReportContext };
