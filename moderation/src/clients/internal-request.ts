import { AppError } from "../http/app-error.js";

async function internalRequest(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) {
    throw new AppError(
      503,
      "dependency_unavailable",
      "Required dependency is unavailable",
    );
  }

  try {
    return await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new AppError(
      503,
      "dependency_unavailable",
      "Required dependency is unavailable",
    );
  }
}

export { internalRequest };
