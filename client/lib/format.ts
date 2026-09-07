import type { Currency } from "./api/commerce-types";

/**
 * Formats a monetary amount in cents into a localized currency string.
 */
export function formatMoney(cents: number, currency: Currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * Formats an ISO date string, timestamp, or Date into a localized medium date/time string.
 */
export function formatDate(value: string | number | Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
