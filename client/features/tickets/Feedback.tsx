import { Button } from "../../components/primitives/Button";
import styles from "./TicketsViews.module.css";

type Props = {
  message: string;
  retry?: () => void;
};

export function Feedback({ message, retry }: Props) {
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
