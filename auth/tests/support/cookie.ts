function readRefreshTokenCookie(setCookie: string | null): string {
  const token = setCookie
    ?.split(",")
    .flatMap((header) => header.split(";"))
    .map((cookie) => cookie.trim().split("="))
    .find(([name]) => name === "refreshToken")
    ?.slice(1)
    .join("=");

  if (!token) throw new Error("Missing refreshToken cookie");
  return token;
}

export { readRefreshTokenCookie };
