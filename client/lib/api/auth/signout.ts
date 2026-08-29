import { authRequest } from "./request";
import { parseNoContent } from "./types";
import { endSession } from "./session";

export async function signout(): Promise<void> {
  try {
    await authRequest("/signout", { method: "POST" }, parseNoContent);
  } finally {
    endSession();
  }
}
