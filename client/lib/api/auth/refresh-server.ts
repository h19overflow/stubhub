import { AuthApiError } from "./request";
import { parseAuthentication, type AuthenticationResponse } from "./types";

const identityServiceUrl = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

type ServerRefreshResult = {
  authentication: AuthenticationResponse | null;
  setCookie: string | null;
};

export async function refreshAuthenticationOnServer(
  cookieHeader: string | undefined,
): Promise<ServerRefreshResult> {
  if (!cookieHeader) return { authentication: null, setCookie: null };

  const response = await fetch(`${identityServiceUrl}/refresh`, {
    method: "POST",
    headers: { Cookie: cookieHeader },
  });
  const setCookie = response.headers.get("Set-Cookie");

  if (response.status === 401) return { authentication: null, setCookie };
  if (!response.ok) {
    throw new AuthApiError(
      response.status,
      `Identity refresh failed with status ${response.status}`,
      response.headers.get("Retry-After"),
    );
  }

  const body: unknown = await response.json();
  return { authentication: parseAuthentication(body), setCookie };
}
