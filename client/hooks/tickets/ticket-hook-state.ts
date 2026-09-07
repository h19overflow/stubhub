import { formatErrorMessage, type LoadState } from "../../lib/load-state";

export type { LoadState };

export function ticketErrorMessage(error: unknown): string {
  return formatErrorMessage(error);
}
