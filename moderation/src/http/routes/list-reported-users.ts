import { Router } from "express";
import { requireAuth } from "@stubhub/common";
import { requireAdmin } from "../require-admin.js";
import { getReportedUsers } from "../../reports/report-workflow.js";

const router = Router();

router.get("/admin/reported-users", requireAuth, requireAdmin, (_request, response) => {
  response.json({ reportedUsers: getReportedUsers() });
});

export { router as listReportedUsers };
