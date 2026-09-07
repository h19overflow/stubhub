/**
 * Standard asynchronous loading state for frontend data hooks.
 */
export type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

/**
 * Normalizes an unknown caught error into a human-readable string.
 */
export function formatErrorMessage(
  error: unknown,
  fallback = "The service is temporarily unavailable",
): string {
  return error instanceof Error ? error.message : fallback;
}
