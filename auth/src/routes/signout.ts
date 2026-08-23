import express from "express";
import {
  clearRefreshTokenCookie,
  readRefreshToken,
} from "../refresh-token-cookie.js";
import { revokeRefreshToken } from "../repos/refresh-token-repo.js";

const router = express.Router();

router.post("/signout", (request, response) => {
  const refreshToken = readRefreshToken(request.headers.cookie);
  if (refreshToken) revokeRefreshToken(refreshToken);
  response.setHeader("Set-Cookie", clearRefreshTokenCookie());
  response.status(204).send();
});

export { router as signout };
