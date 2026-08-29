import { useEffect, useState } from "react";

// Return remaining milliseconds, clamped at zero.
export function useCountdown(expiresAt: string) {
  const remaining = () => Math.max(0, Date.parse(expiresAt) - Date.now());
  const [milliseconds, setMilliseconds] = useState(remaining);

  useEffect(() => {
    const timer = window.setInterval(() => setMilliseconds(remaining()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return milliseconds;
}
