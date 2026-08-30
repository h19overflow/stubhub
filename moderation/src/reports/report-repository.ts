import { randomUUID } from "node:crypto";
import { database, withTransaction } from "../database.js";
import type { ReportRow, ReportStatus } from "./report.js";

type ReportEvidence = {
  reportedUserEmailAtReport: string;
  orderStatusAtReport: "complete";
  ticketId: string;
  eventName: string;
  description: string;
  eventStartsAt: string;
  eventEndsAt: string | null;
  place: string;
  ticketInfo: string;
};

type CreateReportInput = {
  idempotencyKey: string;
  requestFingerprint: string;
  reporterUserId: string;
  reportedUserId: string;
  orderId: string;
  reason: string;
  evidence: ReportEvidence;
};

type CreateResult =
  | { kind: "created"; row: ReportRow }
  | { kind: "replayed"; row: ReportRow }
  | { kind: "conflict"; row: ReportRow };

type ResolveResult =
  | { kind: "not_found" }
  | { kind: "resolved"; row: ReportRow }
  | { kind: "replayed"; row: ReportRow }
  | { kind: "conflict"; row: ReportRow };

function findByIdempotencyKey(
  reporterUserId: string,
  idempotencyKey: string,
): ReportRow | undefined {
  return database
    .prepare(
      "SELECT * FROM reports WHERE reporter_user_id = ? AND idempotency_key = ?",
    )
    .get(reporterUserId, idempotencyKey) as ReportRow | undefined;
}

function createReport(input: CreateReportInput): CreateResult {
  return withTransaction(() => {
    const existing = findByIdempotencyKey(
      input.reporterUserId,
      input.idempotencyKey,
    );
    if (existing) {
      return {
        kind:
          existing.request_fingerprint === input.requestFingerprint
            ? "replayed"
            : "conflict",
        row: existing,
      };
    }

    const id = randomUUID();
    database
      .prepare(`
        INSERT INTO reports (
          id,
          idempotency_key,
          request_fingerprint,
          reporter_user_id,
          reported_user_id,
          order_id,
          reason,
          status,
          reported_user_email_at_report,
          order_status_at_report,
          ticket_id_at_report,
          ticket_event_name_at_report,
          ticket_description_at_report,
          ticket_event_starts_at_report,
          ticket_event_ends_at_report,
          ticket_place_at_report,
          ticket_info_at_report,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.idempotencyKey,
        input.requestFingerprint,
        input.reporterUserId,
        input.reportedUserId,
        input.orderId,
        input.reason,
        input.evidence.reportedUserEmailAtReport,
        input.evidence.orderStatusAtReport,
        input.evidence.ticketId,
        input.evidence.eventName,
        input.evidence.description,
        input.evidence.eventStartsAt,
        input.evidence.eventEndsAt,
        input.evidence.place,
        input.evidence.ticketInfo,
        Date.now(),
      );

    const row = database.prepare("SELECT * FROM reports WHERE id = ?").get(id) as ReportRow | undefined;
    if (!row) throw new Error("Created report could not be read");
    return { kind: "created", row };
  });
}

function listReports(): ReportRow[] {
  return database
    .prepare("SELECT * FROM reports ORDER BY created_at DESC, id DESC")
    .all() as ReportRow[];
}

function resolveReport(
  reportId: string,
  status: Exclude<ReportStatus, "submitted">,
  decisionReason: string,
  resolvedByUserId: string,
): ResolveResult {
  return withTransaction(() => {
    const existing = database.prepare("SELECT * FROM reports WHERE id = ?").get(reportId) as
      | ReportRow
      | undefined;
    if (!existing) return { kind: "not_found" };

    if (existing.status !== "submitted") {
      return {
        kind: existing.status === status ? "replayed" : "conflict",
        row: existing,
      };
    }

    database
      .prepare(`
        UPDATE reports
        SET status = ?, decision_reason = ?, resolved_by_user_id = ?, resolved_at = ?
        WHERE id = ? AND status = 'submitted'
      `)
      .run(status, decisionReason, resolvedByUserId, Date.now(), reportId);
    const row = database.prepare("SELECT * FROM reports WHERE id = ?").get(reportId) as ReportRow | undefined;
    if (!row) throw new Error("Resolved report could not be read");
    return { kind: "resolved", row };
  });
}

export {
  createReport,
  findByIdempotencyKey,
  listReports,
  resolveReport,
};
export type {
  CreateReportInput,
  CreateResult,
  ReportEvidence,
  ResolveResult,
};
