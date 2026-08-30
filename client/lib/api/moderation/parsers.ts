import type {
  Report,
  ReportEvidence,
  ReportTicketEvidence,
  ReportedUser,
  ReportedUsersResponse,
  ReportStatus,
  ResolveReportResult,
} from "./types";

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid moderation service response");
  }
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid moderation service response");
  return value;
}

function nullableString(value: unknown): string | null {
  return value === null ? null : string(value);
}

function reportStatus(value: unknown): ReportStatus {
  if (value !== "submitted" && value !== "upheld" && value !== "cleared") {
    throw new Error("Invalid moderation service response");
  }
  return value;
}

function terminalStatus(value: unknown): "upheld" | "cleared" {
  if (value !== "upheld" && value !== "cleared") {
    throw new Error("Invalid moderation service response");
  }
  return value;
}

function parseTicket(value: unknown): ReportTicketEvidence {
  const ticket = object(value);
  return {
    ticketId: string(ticket.ticketId),
    eventName: string(ticket.eventName),
    description: string(ticket.description),
    eventStartsAt: string(ticket.eventStartsAt),
    eventEndsAt: nullableString(ticket.eventEndsAt),
    place: string(ticket.place),
    ticketInfo: string(ticket.ticketInfo),
  };
}

function parseEvidence(value: unknown): ReportEvidence {
  const report = object(value);
  const reporter = object(report.reporter);
  const order = object(report.order);
  if (order.status !== "complete") throw new Error("Invalid moderation service response");

  return {
    reportId: string(report.reportId),
    status: reportStatus(report.status),
    reason: string(report.reason),
    createdAt: string(report.createdAt),
    reporter: { userId: string(reporter.userId) },
    reportedUserEmailAtReport: string(report.reportedUserEmailAtReport),
    order: { orderId: string(order.orderId), status: "complete" },
    ticket: parseTicket(report.ticket),
    decisionReason: nullableString(report.decisionReason),
    resolvedByUserId: nullableString(report.resolvedByUserId),
    resolvedAt: nullableString(report.resolvedAt),
  };
}

function parseReportedUser(value: unknown): ReportedUser {
  const group = object(value);
  const user = object(group.user);
  if (!Array.isArray(group.reports)) throw new Error("Invalid moderation service response");
  return {
    user: {
      userId: string(user.userId),
      emailAtReport: string(user.emailAtReport),
    },
    reports: group.reports.map(parseEvidence),
  };
}

export function parseReportedUsers(value: unknown): ReportedUsersResponse {
  const body = object(value);
  if (!Array.isArray(body.reportedUsers)) throw new Error("Invalid moderation service response");
  return { reportedUsers: body.reportedUsers.map(parseReportedUser) };
}

export function parseSubmittedReport(value: unknown): Report {
  const body = object(value);
  const report = object(body.report);
  if (reportStatus(report.status) !== "submitted") {
    throw new Error("Invalid moderation service response");
  }
  return {
    reportId: string(report.reportId),
    status: "submitted",
    reporterUserId: string(report.reporterUserId),
    reportedUserId: string(report.reportedUserId),
    orderId: string(report.orderId),
    reason: string(report.reason),
    createdAt: string(report.createdAt),
  };
}

export function parseResolvedReport(value: unknown): ResolveReportResult {
  const body = object(value);
  const report = object(body.report);
  return {
    report: {
      reportId: string(report.reportId),
      status: terminalStatus(report.status),
      decisionReason: string(report.decisionReason),
      resolvedByUserId: string(report.resolvedByUserId),
      resolvedAt: string(report.resolvedAt),
    },
  };
}
