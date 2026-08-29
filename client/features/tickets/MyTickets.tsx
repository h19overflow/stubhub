import { useRouter } from "next/router";
import { useMyTickets } from "../../hooks/tickets/useMyTickets";
import type { TicketStatus } from "../../lib/api/commerce-types";
import { AppFrame } from "../commerce/AppFrame";
import { Feedback } from "./Feedback";
import { OwnedTicket } from "./OwnedTicket";
import styles from "./TicketsViews.module.css";

const statuses: TicketStatus[] = ["available", "reserved", "sold"];

export function MyTickets() {
  const router = useRouter();
  const pageValue = typeof router.query.page === "string" ? Number(router.query.page) : 1;
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const { state, reload, changePrice } = useMyTickets(page);

  return (
    <AppFrame>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Seller inventory</p>
        <h1>My tickets</h1>
      </header>
      {state.status === "loading" ? (
        <Feedback message="Loading your tickets…" />
      ) : state.status === "error" ? (
        <Feedback message={state.message} retry={() => void reload()} />
      ) : state.data.tickets.length === 0 ? (
        <Feedback message="You have not listed any tickets." />
      ) : (
        statuses.map((status) => {
          const tickets = state.data.tickets.filter((ticket) => ticket.status === status);
          return (
            <section className={styles.mineSection} key={status}>
              <h2>{status}</h2>
              {tickets.length ? (
                tickets.map((ticket) => (
                  <OwnedTicket key={ticket.id} onPrice={changePrice} ticket={ticket} />
                ))
              ) : (
                <p>No {status} tickets.</p>
              )}
            </section>
          );
        })
      )}
    </AppFrame>
  );
}
