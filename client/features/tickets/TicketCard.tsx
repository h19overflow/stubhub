import Link from "next/link";
import type { Ticket } from "../../lib/api/commerce-types";
import { formatDate, formatMoney } from "../commerce/AppFrame";
import styles from "./TicketsViews.module.css";

export function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <article className={styles.card}>
      <img alt="" className={styles.cardImage} src={ticket.imageUrl} />
      <div className={styles.cardBody}>
        <span className={`${styles.status} ${styles[ticket.status]}`}>{ticket.status}</span>
        <h2>
          <Link href={`/tickets/${ticket.id}`}>{ticket.eventName}</Link>
        </h2>
        <p>{ticket.place}</p>
        <time dateTime={ticket.eventStartsAt}>{formatDate(ticket.eventStartsAt)}</time>
        <strong>{formatMoney(ticket.priceCents, ticket.currency)}</strong>
      </div>
    </article>
  );
}
