import { useRouter } from "next/router";
import { Button } from "../../components/primitives/Button";
import { useStartOrder } from "../../hooks/orders/useStartOrder";
import { useTicket } from "../../hooks/tickets/useTicket";
import { AppFrame, formatDate, formatMoney } from "../commerce/AppFrame";
import { Feedback } from "./Feedback";
import styles from "./TicketsViews.module.css";

export function TicketDetail({ ticketId }: { ticketId?: string }) {
  const router = useRouter();
  const { state, reload } = useTicket(ticketId);
  const purchase = useStartOrder(ticketId ?? "");

  async function buy() {
    const result = await purchase.start();
    if (result.outcome === "order") {
      await router.push(`/orders/${result.order.id}`);
    } else if (result.outcome === "rejected") {
      await reload();
    }
  }

  if (state.status === "loading") {
    return (
      <AppFrame>
        <Feedback message="Loading ticket…" />
      </AppFrame>
    );
  }
  if (state.status === "error") {
    return (
      <AppFrame>
        <Feedback message={state.message} retry={() => void reload()} />
      </AppFrame>
    );
  }

  const ticket = state.data;
  const canStart = ticket.status === "available" && purchase.status !== "processing";
  const actionLabel =
    purchase.status === "processing"
      ? "Starting purchase…"
      : ticket.status !== "available"
        ? "Not available"
        : purchase.status === "temporary_failure"
          ? "Retry purchase"
          : purchase.status === "rejected"
            ? "Try purchase again"
            : "Start purchase";

  return (
    <AppFrame>
      <article className={styles.detail}>
        <img alt={`${ticket.eventName} ticket listing`} src={ticket.imageUrl} />
        <div>
          <span className={`${styles.status} ${styles[ticket.status]}`}>{ticket.status}</span>
          <h1>{ticket.eventName}</h1>
          <p>{ticket.description}</p>
          <dl>
            <dt>When</dt>
            <dd>
              {formatDate(ticket.eventStartsAt)}
              {ticket.eventEndsAt ? ` – ${formatDate(ticket.eventEndsAt)}` : ""}
            </dd>
            <dt>Where</dt>
            <dd>{ticket.place}</dd>
            <dt>Ticket</dt>
            <dd>{ticket.ticketInfo}</dd>
            <dt>Price</dt>
            <dd>{formatMoney(ticket.priceCents, ticket.currency)}</dd>
          </dl>
          <Button disabled={!canStart} onClick={() => void buy()}>
            {actionLabel}
          </Button>
          {purchase.error ? (
            <p aria-live="polite" className={styles.error}>
              {purchase.error}
            </p>
          ) : null}
        </div>
      </article>
    </AppFrame>
  );
}
