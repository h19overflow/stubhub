import { endSession, getAccessToken, restoreAccessToken } from "./auth/session";

type Parser<T> = (value: unknown) => T;
type ApiRequestOptions<T> = {
  body?: BodyInit;
  fallback?: string;
  headers?: HeadersInit;
  method?: string;
  parse: Parser<T>;
  signal?: AbortSignal;
  protected?: boolean;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
    readonly retryAfter: number | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseError(response: Response, fallback: string) {
  try {
    const value: unknown = await response.json();
    if (typeof value === "object" && value !== null) {
      const body = value as Record<string, unknown>;
      if (typeof body.error === "string") {
        return { message: body.error, code: typeof body.code === "string" ? body.code : "request_failed" };
      }
    }
  } catch {}
  return { message: `${fallback} failed with status ${response.status}`, code: "unexpected_response" };
}

async function send(path: string, options: ApiRequestOptions<unknown>, token?: string) {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (
    options.body !== undefined &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(path, {
    body: options.body,
    credentials: "include",
    headers,
    method: options.method ?? "GET",
    signal: options.signal,
  });
}

function returnToAuth() {
  endSession();
  if (typeof window !== "undefined") window.location.assign("/auth");
}

function isAuthenticationFailure(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 401
  );
}

async function restoreForProtectedRequest() {
  try {
    return await restoreAccessToken();
  } catch (error) {
    if (isAuthenticationFailure(error)) {
      returnToAuth();
      throw new ApiError(401, "Authentication required", "authentication_required", null);
    }
    throw error;
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions<T>): Promise<T> {
  let token: string | undefined;
  if (options.protected) {
    token = getAccessToken() ?? (await restoreForProtectedRequest());
  }

  let response = await send(path, options, token);
  if (options.protected && response.status === 401) {
    token = await restoreForProtectedRequest();
    response = await send(path, options, token);
  }

  if (!response.ok) {
    const error = await parseError(response, options.fallback ?? "Request");
    if (options.protected && response.status === 401) returnToAuth();
    const retryAfterValue = response.headers.get("Retry-After");
    const retryAfter = retryAfterValue === null ? null : Number(retryAfterValue);
    throw new ApiError(
      response.status,
      error.message,
      error.code,
      retryAfter !== null && Number.isFinite(retryAfter) ? retryAfter : null,
    );
  }

  const value: unknown = response.status === 204 ? undefined : await response.json();
  return options.parse(value);
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value);
}
