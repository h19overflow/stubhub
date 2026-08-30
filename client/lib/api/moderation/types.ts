export type ReportStatus = "submitted" | "upheld" | "cleared";

export type Report = {
  reportId: string;
  status: "submitted";
  reporterUserId: string;
  reportedUserId: string;
  orderId: string;
  reason: string;
  createdAt: string;
};

export type ReportTicketEvidence = {
  ticketId: string;
  eventName: string;
  description: string;
  eventStartsAt: string;
  eventEndsAt: string | null;
  place: string;
  ticketInfo: string;
};

export type ReportEvidence = {
  reportId: string;
  status: ReportStatus;
  reason: string;
  createdAt: string;
  reporter: {
    userId: string;
  };
  reportedUserEmailAtReport: string;
  order: {
    orderId: string;
    status: "complete";
  };
  ticket: ReportTicketEvidence;
  decisionReason: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
};

export type ReportedUser = {
  user: {
    userId: string;
    emailAtReport: string;
  };
  reports: ReportEvidence[];
};

export type ReportedUsersResponse = {
  reportedUsers: ReportedUser[];
};

export type ResolveReportResult = {
  report: {
    reportId: string;
    status: "upheld" | "cleared";
    decisionReason: string;
    resolvedByUserId: string;
    resolvedAt: string;
  };
};

export type SubmitReportInput = {
  orderId: string;
  reportedUserId: string;
  reason: string;
};

export type ResolveReportInput = {
  decision: "uphold" | "clear";
  reason: string;
};
