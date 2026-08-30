import Link from "next/link";
import { Button } from "../../components/primitives/Button";
import { useReportedUsers } from "../../hooks/moderation/useReportedUsers";
import { AppFrame, formatDate } from "../commerce/AppFrame";
import styles from "./Moderation.module.css";

export function ReportedUsers() {
  const { load, state } = useReportedUsers();

  return (
    <AppFrame>
      <section className={styles.page}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Moderation workspace</p>
        <h1>Reported users</h1>
        <p className={styles.lede}>
          Review captured report evidence and record a decision for each report.
        </p>
      </header>

      {state.status === "loading" ? (
        <div className={styles.feedback} role="status">
          <p>Loading reported users…</p>
        </div>
      ) : state.status === "error" ? (
        <div className={styles.feedback}>
          <p className={styles.feedbackError} role="alert">
            {state.message}
          </p>
          <Button className={styles.feedbackAction} onClick={() => void load()} variant="secondary">
            Try again
          </Button>
        </div>
      ) : state.data.reportedUsers.length === 0 ? (
        <div className={styles.feedback}>
          <p>No reports have been submitted yet.</p>
          <p>When a buyer submits a report, its captured evidence will appear here.</p>
        </div>
      ) : (
        <div className={styles.userList}>
          {state.data.reportedUsers.map((group) => {
            const newest = group.reports[0];
            const openCount = group.reports.filter((report) => report.status === "submitted").length;
            return (
              <Link
                className={styles.userCard}
                href={`/admin/reported-users/${encodeURIComponent(group.user.userId)}`}
                key={group.user.userId}
              >
                <div>
                  <p className={styles.eyebrow}>Email at latest report</p>
                  <h2>{group.user.emailAtReport}</h2>
                  <p className={styles.userId}>User ID: {group.user.userId}</p>
                  {newest ? <p className={styles.userTime}>Newest report {formatDate(newest.createdAt)}</p> : null}
                </div>
                <div className={styles.userStats}>
                  <span className={styles.statCount}>
                    {group.reports.length} {group.reports.length === 1 ? "report" : "reports"}
                  </span>
                  <span className={styles.statStatus}>
                    <span className={`${styles.status} ${openCount ? styles.submitted : styles.cleared}`}>
                      {openCount ? `${openCount} open` : "resolved"}
                    </span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
    </AppFrame>
  );
}
