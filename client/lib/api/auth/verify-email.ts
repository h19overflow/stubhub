import { postAuthJson } from "./request";
import {
  parseAuthentication,
  parseMessage,
  type AuthenticationResponse,
  type EmailCodeInput,
  type EmailInput,
  type MessageResponse,
} from "./types";

export function requestEmailVerification(input: EmailInput): Promise<MessageResponse> {
  return postAuthJson("/verify-email/request", input, parseMessage);
}

export function verifyEmail(input: EmailCodeInput): Promise<AuthenticationResponse> {
  return postAuthJson("/verify-email", input, parseAuthentication);
}
