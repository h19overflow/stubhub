export type Credentials = {
  email: string;
  password: string;
};

export type EmailInput = {
  email: string;
};

export type EmailCodeInput = EmailInput & {
  code: string;
};

export type UserRole = "user" | "admin";

export type PublicUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
};

export type AuthenticationResponse = {
  user: PublicUser;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
};

export type SignupResponse = {
  user: PublicUser;
  verificationRequired: true;
  emailSent: boolean;
};

export type SigninResponse = {
  codeRequired: true;
};

export type MessageResponse = {
  message: string;
};

export type CurrentUserResponse = {
  user: PublicUser;
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Identity service returned an invalid response");
  }
  return value as JsonObject;
}

function parsePublicUser(value: unknown): PublicUser {
  const user = asObject(value);
  if (
    typeof user.id !== "string" ||
    typeof user.email !== "string" ||
    typeof user.emailVerified !== "boolean" ||
    (user.role !== "user" && user.role !== "admin")
  ) {
    throw new TypeError("Identity service returned an invalid user");
  }

  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
  };
}

export function parseAuthentication(value: unknown): AuthenticationResponse {
  const body = asObject(value);
  if (
    typeof body.accessToken !== "string" ||
    body.tokenType !== "Bearer" ||
    typeof body.expiresIn !== "number" ||
    !Number.isFinite(body.expiresIn) ||
    body.expiresIn <= 0
  ) {
    throw new TypeError("Identity service returned invalid authentication data");
  }

  return {
    user: parsePublicUser(body.user),
    accessToken: body.accessToken,
    tokenType: body.tokenType,
    expiresIn: body.expiresIn,
  };
}

export function parseSignup(value: unknown): SignupResponse {
  const body = asObject(value);
  if (body.verificationRequired !== true || typeof body.emailSent !== "boolean") {
    throw new TypeError("Identity service returned invalid signup data");
  }

  return {
    user: parsePublicUser(body.user),
    verificationRequired: true,
    emailSent: body.emailSent,
  };
}

export function parseSignin(value: unknown): SigninResponse {
  const body = asObject(value);
  if (body.codeRequired !== true) {
    throw new TypeError("Identity service returned invalid signin data");
  }
  return { codeRequired: true };
}

export function parseMessage(value: unknown): MessageResponse {
  const body = asObject(value);
  if (typeof body.message !== "string") {
    throw new TypeError("Identity service returned an invalid message");
  }
  return { message: body.message };
}

export function parseCurrentUser(value: unknown): CurrentUserResponse {
  return { user: parsePublicUser(asObject(value).user) };
}

export function parseNoContent(value: unknown): void {
  if (value !== undefined) {
    throw new TypeError("Identity service returned an unexpected response body");
  }
}
