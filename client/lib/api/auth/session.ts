import { refreshAuthentication } from "./refresh";

let accessToken: string | null = null;
let refreshInFlight: Promise<string> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function restoreAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAuthentication()
      .then((response) => {
        accessToken = response.accessToken;
        return response.accessToken;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

export function endSession() {
  accessToken = null;
}
