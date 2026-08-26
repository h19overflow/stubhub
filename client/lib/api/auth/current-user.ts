import { authRequest } from "./request";
import { parseCurrentUser, type CurrentUserResponse } from "./types";

export function getCurrentUser(accessToken: string): Promise<CurrentUserResponse> {
  return authRequest(
    "/current-user",
    { headers: { Authorization: `Bearer ${accessToken}` } },
    parseCurrentUser,
  );
}
