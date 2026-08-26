const identityUrl = "/api/identity";

type ResponseParser<T> = (value: unknown) => T;

export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfter: string | null,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    // Fall back to a stable message when an error response is not JSON.
  }

  return `Identity request failed with status ${response.status}`;
}

export async function authRequest<T>(
  path: string,
  init: RequestInit,
  parse: ResponseParser<T>,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${identityUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    throw new AuthApiError(
      response.status,
      await errorMessage(response),
      response.headers.get("Retry-After"),
    );
  }

  const body: unknown = response.status === 204 ? undefined : await response.json();
  return parse(body);
}

export function postAuthJson<T>(
  path: string,
  input: unknown,
  parse: ResponseParser<T>,
): Promise<T> {
  return authRequest(path, { method: "POST", body: JSON.stringify(input) }, parse);
}
