import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/primitives/Button";
import { TextField } from "../../components/primitives/TextField";
import { useResolveReport } from "../../hooks/moderation/useResolveReport";
import type { ReportEvidence } from "../../lib/api/moderation/types";
import styles from "./Moderation.module.css";

type Props = {
  onClose: () => void;
  onResolved: (result: {
    reportId: string;
    status: "upheld" | "cleared";
    decisionReason: string;
    resolvedByUserId: string;
    resolvedAt: string;
  }) => void;
  open: boolean;
  report: ReportEvidence;
};

export function DecisionDialog({ onClose, onResolved, open, report }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [decision, setDecision] = useState<"uphold" | "clear">("uphold");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const { reset, resolve, state } = useResolveReport();
  const pending = state.status === "pending";

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => {
    if (!open) {
      reset();
      setDecision("uphold");
      setReason("");
      setReasonError("");
    }
  }, [open, reset]);

  function close() {
    if (pending) return;
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setReasonError("Administrative reason is required.");
      return;
    }
    setReasonError("");
    const result = await resolve(report.reportId, {
      decision,
      reason: trimmedReason,
    });
    if (result) onResolved(result.report);
  }

  return (
    <dialog
      aria-describedby="decision-dialog-description"
      aria-labelledby="decision-dialog-title"
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      ref={dialog}
    >
      <div className={styles.dialogInner}>
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="decision-dialog-title">Record a decision</h2>
            <p id="decision-dialog-description">This records the moderation outcome for this report.</p>
          </div>
          <button
            aria-label="Close decision dialog"
            className={styles.closeButton}
            disabled={pending}
            onClick={close}
            type="button"
          >
            ×
          </button>
        </header>

        <dl className={styles.context}>
          <div>
            <dt>Email at report</dt>
            <dd>{report.reportedUserEmailAtReport}</dd>
          </div>
          <div>
            <dt>Report ID</dt>
            <dd>{report.reportId}</dd>
          </div>
        </dl>

        {state.status === "success" ? (
          <>
            <p className={styles.dialogFeedback} role="status">
              Moderation decision recorded as {state.result.report.status}.
            </p>
            <div className={styles.dialogActions}>
              <Button onClick={onClose} variant="secondary">
                Close
              </Button>
            </div>
          </>
        ) : (
          <form className={styles.dialogForm} onSubmit={submit}>
            <fieldset className={styles.dialogChoices} disabled={pending}>
              <legend>Decision</legend>
              <label className={styles.choice}>
                <input
                  checked={decision === "uphold"}
                  name="decision"
                  onChange={() => setDecision("uphold")}
                  type="radio"
                  value="uphold"
                />
                Uphold report
              </label>
              <label className={styles.choice}>
                <input
                  checked={decision === "clear"}
                  name="decision"
                  onChange={() => setDecision("clear")}
                  type="radio"
                  value="clear"
                />
                Clear report
              </label>
            </fieldset>

            <TextField
              disabled={pending}
              error={reasonError}
              id="decision-reason"
              label="Administrative reason"
              maxLength={2000}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError("");
              }}
              required
              value={reason}
            />

            {state.status === "error" ? (
              <p className={`${styles.dialogFeedback} ${styles.dialogFeedbackError}`} role="alert">
                {state.message}
              </p>
            ) : pending ? (
              <p className={styles.dialogFeedback} role="status">
                Recording decision…
              </p>
            ) : null}

            <div className={styles.dialogActions}>
              <Button disabled={pending} onClick={close} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={pending} type="submit">
                {pending ? "Saving…" : "Confirm decision"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
