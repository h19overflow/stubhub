/**
 * Lifecycle status of an Order across services.
 */
export enum OrderStatus {
 /** When the order has been created, but the ticket it is trying to order has not been reserved. */
 Created = "created",
 /** The ticket has already been reserved, the user cancelled the order, or the order expired before payment. */
 Cancelled = "cancelled",
 /** The order has successfully reserved the ticket and is awaiting payment. */
 AwaitingPayment = "awaiting:payment",
 /** The order has reserved the ticket and the user has provided payment successfully. */
 Complete = "complete",
}
