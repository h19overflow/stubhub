import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/primitives/Button";
import { TextField } from "../../components/primitives/TextField";
import { useSubmitReport } from "../../hooks/moderation/useSubmitReport";
import type { Order } from "../../lib/api/commerce-types";
import styles from "./Moderation.module.css";

type Props = {
  onClose: () => void;
  open: boolean;
  order: Order;
};

export function ReportOrderDialog({ onClose, open, order }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const { reset, state, submit } = useSubmitReport();
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
      setReason("");
      setReasonError("");
    }
  }, [open, reset]);

  function close() {
    if (pending) return;
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason || !order.sellerUserId) {
      setReasonError("Reason for report is required.");
      return;
    }
    setReasonError("");
    await submit({
      orderId: order.id,
      reportedUserId: order.sellerUserId,
      reason: trimmedReason,
    });
  }

  return (
    <dialog
      aria-describedby="report-dialog-description"
      aria-labelledby="report-dialog-title"
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
            <h2 id="report-dialog-title">Report seller</h2>
            <p id="report-dialog-description">Share what happened with this completed purchase.</p>
          </div>
          <button
            aria-label="Close report dialog"
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
            <dt>Seller</dt>
            <dd>{order.sellerUserId ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Order</dt>
            <dd>{order.id}</dd>
          </div>
          <div>
            <dt>Event</dt>
            <dd>{order.ticket.eventName}</dd>
          </div>
          <div>
            <dt>Ticket details</dt>
            <dd>{order.ticket.description ?? order.ticket.ticketInfo}</dd>
          </div>
        </dl>

        {state.status === "success" ? (
          <>
            <p className={styles.dialogFeedback} role="status">
              Report submitted for administrative review.
            </p>
            <div className={styles.dialogActions}>
              <Button onClick={onClose} variant="secondary">
                Close
              </Button>
            </div>
          </>
        ) : (
          <form className={styles.dialogForm} onSubmit={handleSubmit}>
            <TextField
              disabled={pending}
              error={reasonError}
              id="report-reason"
              label="Reason for report"
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
                Submitting report…
              </p>
            ) : null}

            <div className={styles.dialogActions}>
              <Button disabled={pending} onClick={close} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={pending} type="submit">
                {pending ? "Submitting…" : "Submit report"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
