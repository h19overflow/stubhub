/**
 * Standard HTTP application error across all StubHub services.
 *
 * Supports both signatures for seamless compatibility across services:
 * - `new AppError(status, code, message)` (Orders, Moderation convention)
 * - `new AppError(status, message, code?)` (Tickets, Auth convention)
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code?: string);
  constructor(status: number, code: string, message: string);
  constructor(status: number, arg2: string, arg3?: string) {
    if (arg3 !== undefined) {
      // (status, code, message)
      super(arg3);
      this.status = status;
      this.code = arg2;
    } else {
      // (status, message, code?)
      super(arg2);
      this.status = status;
      this.code = "error";
    }
    this.name = "AppError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export { AppError as HttpError };
