import { useState } from "react";
import { Button } from "../../components/primitives/Button";
import { usePayment } from "../../hooks/orders/usePayment";
import type { Order } from "../../lib/api/commerce-types";
import type { PaymentMethodToken } from "../../lib/api/orders/types";
import styles from "./Orders.module.css";

type Props = {
  order: Order;
  setOrder: (order: Order) => void;
};

const outcomes: { value: PaymentMethodToken; label: string }[] = [
  { value: "local.success", label: "Immediate success" },
  { value: "local.decline", label: "Immediate decline" },
  { value: "local.processing-success", label: "Processing, then success" },
  { value: "local.processing-decline", label: "Processing, then decline" },
];

function TerminalOrder({ order }: { order: Order }) {
  if (order.status === "complete") {
    return (
      <section aria-live="polite" className={styles.terminal}>
        <strong>Payment confirmed</strong>
        <p>
          This Order is complete. The amount and event details below are the
          captured purchase record.
        </p>
      </section>
    );
  }

  if (order.status === "expired") {
    return (
      <section
        aria-live="polite"
        className={`${styles.terminal} ${styles.expired}`}
      >
        <strong>Order expired</strong>
        <p>This Order is not payable. Only the backend decides expiration.</p>
      </section>
    );
  }

  return (
    <section aria-live="polite" className={styles.terminal}>
      <strong>Payment processing</strong>
      <p>
        Orders is resolving the payment outcome. This page polls the Order
        without resubmitting.
      </p>
    </section>
  );
}

export function Checkout({ order, setOrder }: Props) {
  const [token, setToken] = useState<PaymentMethodToken>("local.success");
  const payment = usePayment(order.id, order.status, setOrder);

  if (order.status !== "pending") return <TerminalOrder order={order} />;

  const selectedToken = payment.lockedToken ?? token;
  return (
    <form
      className={styles.checkout}
      onSubmit={(event) => {
        event.preventDefault();
        void payment.pay(selectedToken);
      }}
    >
      <div>
        <label htmlFor="payment-outcome">Local learning outcome</label>
        <select
          disabled={payment.lockedToken !== null}
          id="payment-outcome"
          onChange={(event) =>
            setToken(event.target.value as PaymentMethodToken)
          }
          value={selectedToken}
        >
          {outcomes.map((outcome) => (
            <option key={outcome.value} value={outcome.value}>
              {outcome.label}
            </option>
          ))}
        </select>
        <small>
          {payment.lockedToken
            ? "A retry must use the same documented outcome and idempotency key."
            : "These are the four documented safe local-provider tokens. No card data is collected."}
        </small>
      </div>
      <Button
        disabled={
          payment.status === "submitting" || payment.status === "processing"
        }
        type="submit"
      >
        {payment.status === "submitting"
          ? "Submitting…"
          : payment.lockedToken
            ? "Retry same payment"
            : "Pay captured amount"}
      </Button>
      {payment.feedback ? (
        <p
          aria-live="polite"
          className={
            payment.status === "error" || payment.status === "declined"
              ? styles.error
              : styles.success
          }
        >
          {payment.feedback}
        </p>
      ) : null}
    </form>
  );
}
