/**
 * Domain error for Orders — carries HTTP status + machine code for the errorHandler.
 *
 * Flow: purchase/payment workflows throw AppError (e.g. 409 ticket_unavailable,
 * 503 dependency_unavailable); Express catches and serializes {error,code} with
 * the status. Keeps business errors explicit vs 500 unexpected throws.
 */
export { AppError, HttpError } from "@stubhub/common";
