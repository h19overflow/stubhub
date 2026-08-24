const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = "stubhub-identity";
const JWT_AUDIENCE = "stubhub-api";

const configuredSecret = process.env.JWT_SECRET;
if (!configuredSecret || Buffer.byteLength(configuredSecret, "utf8") < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes");
}

const JWT_SECRET = new TextEncoder().encode(configuredSecret);

export {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_SECRET,
  REFRESH_TOKEN_TTL_MS,
};
