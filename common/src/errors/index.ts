/**
 * Standard HTTP application error across all StubHub services.
 *
 * Calling conventions:
 * - `new AppError(status, code, message)` (Canonical: HTTP status, snake_case code, human message)
 * - `new AppError(status, message)` (Fallback: HTTP status, human message, code="error")
 * - Defensively handles legacy `(status, message, code)` call order without inverting.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string);
  constructor(status: number, message: string);
  constructor(status: number, arg2: string, arg3?: string) {
    if (arg3 !== undefined) {
      // Detect if arg2 is a descriptive message (contains spaces) and arg3 is a machine code (no spaces)
      if (arg2.includes(" ") && !arg3.includes(" ")) {
        super(arg2);
        this.status = status;
        this.code = arg3;
      } else {
        super(arg3);
        this.status = status;
        this.code = arg2;
      }
    } else {
      super(arg2);
      this.status = status;
      this.code = "error";
    }
    this.name = "AppError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export { AppError as HttpError };
