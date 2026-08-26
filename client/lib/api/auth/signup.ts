import { postAuthJson } from "./request";
import { parseSignup, type Credentials, type SignupResponse } from "./types";

export function signup(input: Credentials): Promise<SignupResponse> {
  return postAuthJson("/signup", input, parseSignup);
}