import { ApiError, apiRequest, jsonBody } from "../request";

const identityUrl = "/api/identity";
type ResponseParser<T> = (value: unknown) => T;

export class AuthApiError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfter: string | null) {
    super(message);
    this.name = "AuthApiError";
  }
}

export async function authRequest<T>(path: string, init: RequestInit, parse: ResponseParser<T>): Promise<T> {
  try {
    return await apiRequest(`${identityUrl}${path}`, {
      body: init.body ?? undefined,
      fallback: "Identity request",
      headers: init.headers,
      method: init.method,
      parse,
    });
  } catch (error) {
    if (error instanceof ApiError) throw new AuthApiError(error.status, error.message, error.retryAfter === null ? null : String(error.retryAfter));
    throw error;
  }
}

export function postAuthJson<T>(path: string, input: unknown, parse: ResponseParser<T>): Promise<T> {
  return authRequest(path, { method: "POST", body: jsonBody(input) }, parse);
}
