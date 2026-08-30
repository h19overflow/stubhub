import { apiRequest, jsonBody } from "../request";
import { parseResolvedReport, parseSubmittedReport } from "./parsers";
import type {
  ResolveReportInput,
  ResolveReportResult,
  SubmitReportInput,
  Report,
} from "./types";

const base = "/api/moderation";

export function submitReport(
  input: SubmitReportInput,
  idempotencyKey: string,
): Promise<Report> {
  return apiRequest(`${base}/reports`, {
    body: jsonBody(input),
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
    parse: parseSubmittedReport,
    protected: true,
  });
}

export function resolveReport(
  reportId: string,
  input: ResolveReportInput,
): Promise<ResolveReportResult> {
  return apiRequest(`${base}/admin/reports/${encodeURIComponent(reportId)}/resolve`, {
    body: jsonBody(input),
    method: "POST",
    parse: parseResolvedReport,
    protected: true,
  });
}
