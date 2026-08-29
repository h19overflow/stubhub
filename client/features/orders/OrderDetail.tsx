import { useOrder } from "../../hooks/orders/useOrder";
import { AppFrame, formatDate, formatMoney } from "../commerce/AppFrame";
import { Checkout } from "./Checkout";
import { OrderCountdown } from "./OrderCountdown";
import { OrderFeedback } from "./OrderFeedback";
import styles from "./Orders.module.css";

type Props = {
  orderId?: string;
};

export function OrderDetail({ orderId }: Props) {
  const { state, reload, setOrder } = useOrder(orderId);

  if (state.status === "loading") {
    return (
      <AppFrame>
        <OrderFeedback message="Loading Order…" />
      </AppFrame>
    );
  }

  if (state.status === "error") {
    return (
      <AppFrame>
        <OrderFeedback
          message={state.message}
          retry={() => void reload()}
        />
      </AppFrame>
    );
  }

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
            <dt>Event starts</dt>
            <dd>{formatDate(order.ticket.eventStartsAt)}</dd>
            {order.ticket.eventEndsAt ? (
              <>
                <dt>Event ends</dt>
                <dd>{formatDate(order.ticket.eventEndsAt)}</dd>
              </>
            ) : null}
            <dt>Ticket</dt>
            <dd>{order.ticket.ticketInfo}</dd>
            <dt>Captured amount</dt>
            <dd>{formatMoney(order.amountCents, order.currency)}</dd>
            <dt>Backend deadline</dt>
            <dd>{formatDate(order.expiresAt)}</dd>
            {order.status === "pending" ? (
              <>
                <dt>Display countdown</dt>
                <dd>
                  <OrderCountdown expiresAt={order.expiresAt} />
                </dd>
              </>
            ) : null}
          </dl>
          <Checkout order={order} setOrder={setOrder} />
        </div>
      </article>
    </AppFrame>
  );
}
