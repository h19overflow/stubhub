import Link from "next/link";
import { useState } from "react";
import { Button } from "../../components/primitives/Button";
import { useCountdown, useOrder, useOrders, usePayment } from "../../hooks/orders/useOrders";
import type { Order } from "../../lib/api/commerce-types";
import type { PaymentMethodToken } from "../../lib/api/orders/client";
import { AppFrame, formatDate, formatMoney } from "../commerce/AppFrame";
import styles from "./OrdersViews.module.css";

function Countdown({ expiresAt }: { expiresAt: string }) {
  const milliseconds = useCountdown(expiresAt);
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return (
    <span aria-label="Reservation time remaining">
      {minutes}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

function Feedback({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <section aria-live="polite" className={styles.feedback}>
      <p>{message}</p>
      {retry ? (
        <Button onClick={retry} variant="secondary">
          Try again
        </Button>
      ) : null}
    </section>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <article className={styles.orderCard}>
      <div>
        <span className={`${styles.status} ${styles[order.status]}`}>
          {order.status.replace("_", " ")}
        </span>
        <h2>
          <Link href={`/orders/${order.id}`}>{order.ticket.eventName}</Link>
        </h2>
        <p>{order.ticket.place} · {formatDate(order.ticket.eventStartsAt)}</p>
      </div>
      <div className={styles.amount}>
        <strong>{formatMoney(order.amountCents, order.currency)}</strong>
        {order.status === "pending" ? (
          <small>Time remaining <Countdown expiresAt={order.expiresAt} /></small>
        ) : null}
      </div>
    </article>
  );
}

export function MyOrders() {
  const { state, reload } = useOrders();
  return (
    <AppFrame>
      <header className={styles.heading}>
        <p>Purchase history</p>
        <h1>My orders</h1>
        <span>Pending, processing, and completed Orders use the captured Ticket snapshot.</span>
      </header>
      {state.status === "loading" ? (
        <Feedback message="Loading your orders…" />
      ) : state.status === "error" ? (
        <Feedback message={state.message} retry={() => void reload()} />
      ) : state.data.length === 0 ? (
        <Feedback message="You have no active or completed orders." />
      ) : (
        <div className={styles.list}>
          {state.data.map((order) => <OrderCard key={order.id} order={order} />)}
        </div>
      )}
    </AppFrame>
  );
}

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
        <p>This Order is complete. The amount and event details below are the captured purchase record.</p>
      </section>
    );
  }
  if (order.status === "expired") {
    return (
      <section aria-live="polite" className={`${styles.terminal} ${styles.expired}`}>
        <strong>Order expired</strong>
        <p>This Order is not payable. Only the backend decides expiration.</p>
      </section>
    );
  }
  return (
    <section aria-live="polite" className={styles.terminal}>
      <strong>Payment processing</strong>
      <p>Orders is resolving the payment outcome. This page polls the Order without resubmitting.</p>
    </section>
  );
}

function Checkout({ order, setOrder }: { order: Order; setOrder: (order: Order) => void }) {
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
          onChange={(event) => setToken(event.target.value as PaymentMethodToken)}
          value={selectedToken}
        >
          {outcomes.map((outcome) => (
            <option key={outcome.value} value={outcome.value}>{outcome.label}</option>
          ))}
        </select>
        <small>
          {payment.lockedToken
            ? "A retry must use the same documented outcome and idempotency key."
            : "These are the four documented safe local-provider tokens. No card data is collected."}
        </small>
      </div>
      <Button
        disabled={payment.status === "submitting" || payment.status === "processing"}
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
          className={payment.status === "error" || payment.status === "declined" ? styles.error : styles.success}
        >
          {payment.feedback}
        </p>
      ) : null}
    </form>
  );
}

export function OrderDetail({ orderId }: { orderId?: string }) {
  const { state, reload, setOrder } = useOrder(orderId);
  if (state.status === "loading") return <AppFrame><Feedback message="Loading Order…" /></AppFrame>;
  if (state.status === "error") return <AppFrame><Feedback message={state.message} retry={() => void reload()} /></AppFrame>;

  const order = state.data;
  return (
    <AppFrame>
      <article className={styles.detail}>
        <header>
          <span className={`${styles.status} ${styles[order.status]}`}>
            {order.status.replace("_", " ")}
          </span>
          <p>Order {order.id}</p>
          <h1>{order.ticket.eventName}</h1>
          <span>{order.ticket.place}</span>
        </header>
        <div className={styles.summary}>
          <dl>
            <dt>Event starts</dt><dd>{formatDate(order.ticket.eventStartsAt)}</dd>
            {order.ticket.eventEndsAt ? <><dt>Event ends</dt><dd>{formatDate(order.ticket.eventEndsAt)}</dd></> : null}
            <dt>Ticket</dt><dd>{order.ticket.ticketInfo}</dd>
            <dt>Captured amount</dt><dd>{formatMoney(order.amountCents, order.currency)}</dd>
            <dt>Backend deadline</dt><dd>{formatDate(order.expiresAt)}</dd>
            {order.status === "pending" ? <><dt>Display countdown</dt><dd><Countdown expiresAt={order.expiresAt} /></dd></> : null}
          </dl>
          <Checkout order={order} setOrder={setOrder} />
        </div>
      </article>
    </AppFrame>
  );
}
