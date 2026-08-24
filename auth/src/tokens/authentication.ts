import { createAccessToken } from "./access-token.js";
import { ACCESS_TOKEN_TTL_SECONDS } from "./token-config.js";
import {
  createRefreshToken,
  rotateRefreshToken,
} from "./refresh-token-repo.js";
import type { PublicUser } from "../users/user.js";

type AuthenticationBody = {
  user: PublicUser;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
};
type Authentication = {
  body: AuthenticationBody;
  refreshToken: string;
};
async function authenticationBody(user: PublicUser): Promise<AuthenticationBody> {
  return {
    user,
    accessToken: await createAccessToken(user),
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

async function createAuthentication(user: PublicUser): Promise<Authentication> {
  return {
    body: await authenticationBody(user),
    // Kept outside the response body so callers cannot accidentally expose it as JSON.
    refreshToken: createRefreshToken(user.id),
  };
}

async function refreshAuthentication(rawRefreshToken: string): Promise<Authentication | null> {
  const refreshed = rotateRefreshToken(rawRefreshToken);
  if (!refreshed) return null;
  return {
    body: await authenticationBody(refreshed.user),
    refreshToken: refreshed.refreshToken,
  };
}

export { createAuthentication, refreshAuthentication };
