import { useCountdown } from "../../hooks/orders/useCountdown";

type Props = {
  expiresAt: string;
};

export function OrderCountdown({ expiresAt }: Props) {
  const milliseconds = useCountdown(expiresAt);
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);

  return (
    <span aria-label="Reservation time remaining">
      {minutes}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}
