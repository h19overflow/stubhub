import { AppError } from "../http/app-error.js";
import { getExactUser } from "../clients/identity-client.js";
import { getReportContext } from "../clients/orders-client.js";
import {
  createReport as insertReport,
  findByIdempotencyKey,
  listReports,
  resolveReport as updateReport,
} from "./report-repository.js";
import {
  toAdminReport,
  toCreateReport,
  toResolutionReport,
  type ReportedUserGroup,
} from "./report.js";

function requestFingerprint(input: {
  reporterUserId: string;
  orderId: string;
  reportedUserId: string;
  reason: string;
}): string {
  return JSON.stringify([
    input.reporterUserId,
    input.orderId,
    input.reportedUserId,
    input.reason,
  ]);
}

/**
 * Replays a durable idempotency result before contacting dependencies, then
 * validates external authority and atomically captures new report evidence.
 */
async function createReport(input: {
  reporterUserId: string;
  orderId: string;
  reportedUserId: string;
  reason: string;
  idempotencyKey: string;
}) {
  const fingerprint = requestFingerprint(input);
  const existing = findByIdempotencyKey(
    input.reporterUserId,
    input.idempotencyKey,
  );
  if (existing) {
    if (existing.request_fingerprint !== fingerprint) {
      throw new AppError(
        409,
        "idempotency_conflict",
        "Idempotency key was already used for a different report",
      );
    }
    return toCreateReport(existing);
  }

  const context = await getReportContext(
    input.orderId,
    input.reporterUserId,
    input.reportedUserId,
  );
  if (
    context.orderId !== input.orderId ||
    context.reportedUserId !== input.reportedUserId
  ) {
    throw new AppError(
      503,
      "dependency_unavailable",
      "Orders service is unavailable",
    );
  }

  let reportedUser;
  try {
    reportedUser = await getExactUser(input.reportedUserId);
  } catch (error) {
    if (error instanceof AppError && error.code === "user_not_found") {
      throw new AppError(
        404,
        "report_context_not_found",
        "Report context not found",
      );
    }
    throw error;
  }
  if (reportedUser.userId !== input.reportedUserId) {
    throw new AppError(
      503,
      "dependency_unavailable",
      "Identity service is unavailable",
    );
  }

  const result = insertReport({
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: fingerprint,
    reporterUserId: input.reporterUserId,
    reportedUserId: input.reportedUserId,
    orderId: input.orderId,
    reason: input.reason,
    evidence: {
      reportedUserEmailAtReport: reportedUser.email,
      orderStatusAtReport: context.orderStatus,
      ticketId: context.ticket.ticketId,
      eventName: context.ticket.eventName,
      description: context.ticket.description,
      eventStartsAt: context.ticket.eventStartsAt,
      eventEndsAt: context.ticket.eventEndsAt,
      place: context.ticket.place,
      ticketInfo: context.ticket.ticketInfo,
    },
  });

  if (result.kind === "conflict") {
    throw new AppError(
      409,
      "idempotency_conflict",
      "Idempotency key was already used for a different report",
    );
  }
  return toCreateReport(result.row);
}

/**
 * Reads the complete captured evidence set in one local query and groups rows
 * newest-first by reported user. No Identity, Orders, or Tickets fan-out occurs.
 */
function getReportedUsers(): ReportedUserGroup[] {
  const groups = new Map<string, ReportedUserGroup>();
  for (const row of listReports()) {
    let group = groups.get(row.reported_user_id);
    if (!group) {
      group = {
        user: {
          userId: row.reported_user_id,
          emailAtReport: row.reported_user_email_at_report,
        },
        reports: [],
      };
      groups.set(row.reported_user_id, group);
    }
    group.reports.push(toAdminReport(row));
  }
  return [...groups.values()];
}

/**
 * Commits only the local terminal moderation decision. Upholding has no
 * enforcement, event, account, Order, or Ticket side effect in this slice.
 */
function resolveReport(input: {
  reportId: string;
  decision: "uphold" | "clear";
  reason: string;
  resolvedByUserId: string;
}) {
  const status = input.decision === "uphold" ? "upheld" : "cleared";
  const result = updateReport(
    input.reportId,
    status,
    input.reason,
    input.resolvedByUserId,
  );
  if (result.kind === "not_found") {
    throw new AppError(404, "report_not_found", "Report not found");
  }
  if (result.kind === "conflict") {
    throw new AppError(
      409,
      "report_already_resolved",
      "Report already has a different resolution",
    );
  }
  return toResolutionReport(result.row);
}

export { createReport, getReportedUsers, resolveReport };
