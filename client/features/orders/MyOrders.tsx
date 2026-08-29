import { useOrders } from "../../hooks/orders/useOrders";
import { AppFrame } from "../commerce/AppFrame";
import { OrderCard } from "./OrderCard";
import { OrderFeedback } from "./OrderFeedback";
import styles from "./Orders.module.css";

export function MyOrders() {
  const { state, reload } = useOrders();

  return (
    <AppFrame>
      <header className={styles.heading}>
        <p>Purchase history</p>
        <h1>My orders</h1>
        <span>
          Pending, processing, and completed Orders use the captured Ticket
          snapshot.
        </span>
      </header>
      {state.status === "loading" ? (
        <OrderFeedback message="Loading your orders…" />
      ) : state.status === "error" ? (
        <OrderFeedback
          message={state.message}
          retry={() => void reload()}
        />
      ) : state.data.length === 0 ? (
        <OrderFeedback message="You have no active or completed orders." />
      ) : (
        <div className={styles.list}>
          {state.data.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </AppFrame>
  );
}
