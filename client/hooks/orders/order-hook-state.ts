import { formatErrorMessage, type LoadState } from "../../lib/load-state";

export type { LoadState };

export function orderErrorMessage(error: unknown): string {
  return formatErrorMessage(error);
}
