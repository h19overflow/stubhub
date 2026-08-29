import { postAuthJson } from "./request";
import {
  parseAuthentication,
  parseSignin,
  type AuthenticationResponse,
  type Credentials,
  type EmailCodeInput,
  type SigninResponse,
} from "./types";
import { setAccessToken } from "./session";

export async function signin(input: Credentials): Promise<SigninResponse> {
  const response = await postAuthJson("/signin", input, parseSignin);
  if (!("codeRequired" in response)) setAccessToken(response.accessToken);
  return response;
}

export async function signinWithCode(input: EmailCodeInput): Promise<AuthenticationResponse> {
  const response = await postAuthJson("/signin/code", input, parseAuthentication);
  setAccessToken(response.accessToken);
  return response;
}