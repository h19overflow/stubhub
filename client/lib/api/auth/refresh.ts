import { authRequest } from "./request";
import { parseAuthentication, type AuthenticationResponse } from "./types";

export function refreshAuthentication(): Promise<AuthenticationResponse> {
  return authRequest("/refresh", { method: "POST" }, parseAuthentication);
}
