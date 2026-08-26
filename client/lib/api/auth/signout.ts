import { authRequest } from "./request";
import { parseNoContent } from "./types";

export function signout(): Promise<void> {
  return authRequest("/signout", { method: "POST" }, parseNoContent);
}
