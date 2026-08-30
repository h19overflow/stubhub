type ReportStatus = "submitted" | "upheld" | "cleared";
type ReportDecision = "uphold" | "clear";

type ReportRow = {
  id: string;
  idempotency_key: string;
  request_fingerprint: string;
  reporter_user_id: string;
  reported_user_id: string;
  order_id: string;
  reason: string;
  status: ReportStatus;
  reported_user_email_at_report: string;
  order_status_at_report: "complete";
  ticket_id_at_report: string;
  ticket_event_name_at_report: string;
  ticket_description_at_report: string;
  ticket_event_starts_at_report: string;
  ticket_event_ends_at_report: string | null;
  ticket_place_at_report: string;
  ticket_info_at_report: string;
  decision_reason: string | null;
  resolved_by_user_id: string | null;
  resolved_at: number | null;
  created_at: number;
};

type CreateReport = {
  reportId: string;
  status: "submitted";
  reporterUserId: string;
  reportedUserId: string;
  orderId: string;
  reason: string;
  createdAt: string;
};

type ResolutionReport = {
  reportId: string;
  status: "upheld" | "cleared";
  decisionReason: string;
  resolvedByUserId: string;
  resolvedAt: string;
};

type AdminReport = {
  reportId: string;
  status: ReportStatus;
  reason: string;
  createdAt: string;
  reporter: { userId: string };
  reportedUserEmailAtReport: string;
  order: { orderId: string; status: "complete" };
  ticket: {
    ticketId: string;
    eventName: string;
    description: string;
    eventStartsAt: string;
    eventEndsAt: string | null;
    place: string;
    ticketInfo: string;
  };
  decisionReason: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
};

type ReportedUserGroup = {
  user: { userId: string; emailAtReport: string };
  reports: AdminReport[];
};

function toCreateReport(row: ReportRow): CreateReport {
  return {
    reportId: row.id,
    status: "submitted",
    reporterUserId: row.reporter_user_id,
    reportedUserId: row.reported_user_id,
    orderId: row.order_id,
    reason: row.reason,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function toResolutionReport(row: ReportRow): ResolutionReport {
  if (
    (row.status !== "upheld" && row.status !== "cleared") ||
    row.decision_reason === null ||
    row.resolved_by_user_id === null ||
    row.resolved_at === null
  ) {
    throw new Error("Invalid terminal report row");
  }
  return {
    reportId: row.id,
    status: row.status,
    decisionReason: row.decision_reason,
    resolvedByUserId: row.resolved_by_user_id,
    resolvedAt: new Date(row.resolved_at).toISOString(),
  };
}

function toAdminReport(row: ReportRow): AdminReport {
  return {
    reportId: row.id,
    status: row.status,
    reason: row.reason,
    createdAt: new Date(row.created_at).toISOString(),
    reporter: { userId: row.reporter_user_id },
    reportedUserEmailAtReport: row.reported_user_email_at_report,
    order: {
      orderId: row.order_id,
      status: row.order_status_at_report,
    },
    ticket: {
      ticketId: row.ticket_id_at_report,
      eventName: row.ticket_event_name_at_report,
      description: row.ticket_description_at_report,
      eventStartsAt: row.ticket_event_starts_at_report,
      eventEndsAt: row.ticket_event_ends_at_report,
      place: row.ticket_place_at_report,
      ticketInfo: row.ticket_info_at_report,
    },
    decisionReason: row.decision_reason,
    resolvedByUserId: row.resolved_by_user_id,
    resolvedAt:
      row.resolved_at === null ? null : new Date(row.resolved_at).toISOString(),
  };
}

export {
  toAdminReport,
  toCreateReport,
  toResolutionReport,
};
export type {
  AdminReport,
  CreateReport,
  ReportDecision,
  ReportRow,
  ReportStatus,
  ReportedUserGroup,
  ResolutionReport,
};
