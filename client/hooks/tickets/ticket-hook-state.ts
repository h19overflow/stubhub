export type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

export function ticketErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The service is temporarily unavailable";
}
