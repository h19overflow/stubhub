import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../../components/primitives/Button";
import type { Ticket } from "../../lib/api/commerce-types";
import { formatDate, formatMoney } from "../commerce/AppFrame";
import styles from "./TicketsViews.module.css";

type Props = {
  ticket: Ticket;
  onPrice: (id: string, cents: number) => Promise<void>;
};

export function OwnedTicket({ ticket, onPrice }: Props) {
  const [price, setPrice] = useState(String(ticket.priceCents / 100));
  const [feedback, setFeedback] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    try {
      await onPrice(ticket.id, Math.round(Number(price) * 100));
      setFeedback("Price updated.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Price update failed");
    }
  }

  return (
    <article className={styles.owned}>
      <img alt="" src={ticket.imageUrl} />
      <div>
        <span className={`${styles.status} ${styles[ticket.status]}`}>{ticket.status}</span>
        <h2>
          <Link href={`/tickets/${ticket.id}`}>{ticket.eventName}</Link>
        </h2>
        <p>
          {formatDate(ticket.eventStartsAt)} · {ticket.place}
        </p>
        {ticket.status === "available" ? (
          <form className={styles.priceEdit} onSubmit={submit}>
            <label>
              Price (USD)
              <input
                min="0.01"
                onChange={(event) => setPrice(event.target.value)}
                step="0.01"
                type="number"
                value={price}
              />
            </label>
            <Button type="submit" variant="secondary">
              Update
            </Button>
          </form>
        ) : (
          <strong>{formatMoney(ticket.priceCents, ticket.currency)}</strong>
        )}
        <p
          aria-live="polite"
          className={feedback.includes("updated") ? styles.success : styles.error}
        >
          {feedback}
        </p>
      </div>
    </article>
  );
}
