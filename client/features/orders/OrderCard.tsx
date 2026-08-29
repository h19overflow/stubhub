import Link from "next/link";
import type { Order } from "../../lib/api/commerce-types";
import { formatDate, formatMoney } from "../commerce/AppFrame";
import { OrderCountdown } from "./OrderCountdown";
import styles from "./Orders.module.css";

type Props = {
  order: Order;
};

export function OrderCard({ order }: Props) {
  return (
    <article className={styles.orderCard}>
      <div>
        <span className={`${styles.status} ${styles[order.status]}`}>
          {order.status.replace("_", " ")}
        </span>
        <h2>
          <Link href={`/orders/${order.id}`}>{order.ticket.eventName}</Link>
        </h2>
        <p>
          {order.ticket.place} · {formatDate(order.ticket.eventStartsAt)}
        </p>
      </div>
      <div className={styles.amount}>
        <strong>{formatMoney(order.amountCents, order.currency)}</strong>
        {order.status === "pending" ? (
          <small>
            Time remaining <OrderCountdown expiresAt={order.expiresAt} />
          </small>
        ) : null}
      </div>
    </article>
  );
}
