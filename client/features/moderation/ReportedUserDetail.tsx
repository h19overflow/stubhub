import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/primitives/Button";
import { useReportedUsers } from "../../hooks/moderation/useReportedUsers";
import type { ReportEvidence } from "../../lib/api/moderation/types";
import { AppFrame, formatDate } from "../commerce/AppFrame";
import { DecisionDialog } from "./DecisionDialog";
import styles from "./Moderation.module.css";

type Props = {
  userId?: string;
};

type ResolvedReport = {
  reportId: string;
  status: "upheld" | "cleared";
  decisionReason: string;
  resolvedByUserId: string;
  resolvedAt: string;
};

export function ReportedUserDetail({ userId }: Props) {
  const { load, state } = useReportedUsers();
  const [selectedReportId, setSelectedReportId] = useState<string>();
  const [resolvedReport, setResolvedReport] = useState<ResolvedReport | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const group = state.status === "ready"
    ? state.data.reportedUsers.find((entry) => entry.user.userId === userId)
    : undefined;

  useEffect(() => {
    if (!group) return;
    if (!group.reports.some((report) => report.reportId === selectedReportId)) {
      setSelectedReportId(group.reports[0]?.reportId);
      setResolvedReport(null);
    }
  }, [group, selectedReportId]);

  if (state.status === "loading") {
    return (
      <AppFrame>
        <div className={styles.feedback} role="status">
          <p>Loading report evidence…</p>
        </div>
      </AppFrame>
    );
  }

  if (state.status === "error") {
    return (
      <AppFrame>
        <div className={styles.feedback}>
          <p className={styles.feedbackError} role="alert">
            {state.message}
          </p>
          <Button className={styles.feedbackAction} onClick={() => void load()} variant="secondary">
            Try again
          </Button>
        </div>
      </AppFrame>
    );
  }

  if (!group || group.reports.length === 0) {
    return (
      <AppFrame>
        <div className={styles.feedback}>
          <p>No captured report evidence was found for this user.</p>
          <Link className={styles.backLink} href="/admin/reported-users">
            Back to reported users
          </Link>
        </div>
      </AppFrame>
    );
  }

  const selectedReport =
    group.reports.find((report) => report.reportId === selectedReportId) ?? group.reports[0];
  const report: ReportEvidence =
    resolvedReport?.reportId === selectedReport.reportId
      ? { ...selectedReport, ...resolvedReport }
      : selectedReport;

  return (
    <AppFrame>
      <section className={styles.page}>
        <Link className={styles.backLink} href="/admin/reported-users">
          ← All reported users
        </Link>
        <header className={styles.detailHeader}>
          <p className={styles.eyebrow}>Evidence detail</p>
          <p className={styles.eyebrow}>Email at latest report</p>
          <h1>{group.user.emailAtReport}</h1>
          <p>User ID: {group.user.userId}</p>
        </header>

        {group.reports.length > 1 ? (
          <nav aria-label="Reports for this user" className={styles.reportPicker}>
            {group.reports.map((entry, index) => (
              <button
                aria-current={entry.reportId === report.reportId}
                key={entry.reportId}
                onClick={() => {
                  setSelectedReportId(entry.reportId);
                  setResolvedReport(null);
                }}
                type="button"
              >
                Report {index + 1} · {entry.status}
              </button>
            ))}
          </nav>
        ) : null}

        <article className={styles.evidence}>
          <header className={styles.evidenceHeader}>
            <div>
              <h2>Report {report.reportId}</h2>
              <p>Submitted {formatDate(report.createdAt)}</p>
            </div>
            <span className={`${styles.status} ${styles[report.status]}`}>{report.status}</span>
          </header>

          <dl className={styles.evidenceGrid}>
            <div>
              <dt>Email at report</dt>
              <dd>{report.reportedUserEmailAtReport}</dd>
            </div>
            <div>
              <dt>Reporter ID</dt>
              <dd>{report.reporter.userId}</dd>
            </div>
            <div>
              <dt>Order ID</dt>
              <dd>{report.order.orderId}</dd>
            </div>
            <div>
              <dt>Order status</dt>
              <dd>{report.order.status}</dd>
            </div>
            <div>
              <dt>Event</dt>
              <dd>{report.ticket.eventName}</dd>
            </div>
            <div>
              <dt>Place</dt>
              <dd>{report.ticket.place}</dd>
            </div>
            <div>
              <dt>Event starts</dt>
              <dd>{formatDate(report.ticket.eventStartsAt)}</dd>
            </div>
            {report.ticket.eventEndsAt ? (
              <div>
                <dt>Event ends</dt>
                <dd>{formatDate(report.ticket.eventEndsAt)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Ticket description</dt>
              <dd>{report.ticket.description}</dd>
            </div>
            <div>
              <dt>Ticket information</dt>
              <dd>{report.ticket.ticketInfo}</dd>
            </div>
          </dl>

          <section className={styles.reason}>
            <h3>Submitted reason</h3>
            <p>{report.reason}</p>
          </section>

          {report.status === "submitted" ? (
            <div className={styles.resolution}>
              <Button onClick={() => setDialogOpen(true)} type="button">
                Record decision
              </Button>
            </div>
          ) : (
            <section className={styles.resolution}>
              <p className={styles.resolutionSuccess} role="status">
                Moderation decision recorded as {report.status}.
              </p>
              <p className={styles.resolutionMeta}>
                Decision reason: {report.decisionReason ?? "Not provided"}
              </p>
              <p className={styles.resolutionMeta}>
                Resolved {report.resolvedAt ? formatDate(report.resolvedAt) : "at an unknown time"} by {report.resolvedByUserId ?? "an administrator"}.
              </p>
            </section>
          )}
        </article>

        <DecisionDialog
          onClose={() => setDialogOpen(false)}
          onResolved={setResolvedReport}
          open={dialogOpen}
          report={report}
        />
      </section>
    </AppFrame>
  );
}
