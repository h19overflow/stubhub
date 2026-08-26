import { postAuthJson } from "./request";
import {
  parseAuthentication,
  parseSignin,
  type AuthenticationResponse,
  type Credentials,
  type EmailCodeInput,
  type SigninResponse,
} from "./types";

export function signin(input: Credentials): Promise<SigninResponse> {
  return postAuthJson("/signin", input, parseSignin);
}

export function signinWithCode(input: EmailCodeInput): Promise<AuthenticationResponse> {
  return postAuthJson("/signin/code", input, parseAuthentication);
}