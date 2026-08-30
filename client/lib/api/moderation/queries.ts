import { apiRequest } from "../request";
import { parseReportedUsers } from "./parsers";
import type { ReportedUsersResponse } from "./types";

const base = "/api/moderation";

export function listReportedUsers(): Promise<ReportedUsersResponse> {
  return apiRequest(`${base}/admin/reported-users`, {
    parse: parseReportedUsers,
    protected: true,
  });
}
