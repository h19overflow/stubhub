import express from "express";
import { consumeChallenge, issueChallenge } from "../../challenges/email-challenge-repo.js";
import { createAuthentication } from "../../tokens/authentication.js";
import { refreshTokenCookie } from "../../tokens/refresh-token-cookie.js";
import { authenticateUser } from "../../users/user-repo.js";
import { sendCode } from "../../email/challenge-email.js";
import { authRateLimit } from "../rate-limit.js";
import { credentialsSchema, emailCodeSchema } from "../schemas.js";

const router = express.Router();

router.post("/signin", authRateLimit, async (request, response) => {
  const credentials = credentialsSchema.safeParse(request.body);
  if (!credentials.success) {
    response.status(400).json({ error: "A valid email and password of 8 to 256 characters are required" });
    return;
  }

  const result = await authenticateUser(credentials.data);
  if (result.status === "invalid") {
    response.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (result.status === "locked") {
    response.setHeader("Retry-After", "300");
    response.status(429).json({ error: "Too many attempts. Try again later" });
    return;
  }
  if (result.status === "unverified") {
    response.status(403).json({ error: "Email verification required" });
    return;
  }

  const code = await issueChallenge(result.user, "signin");
  if (code) {
    try {
      await sendCode(result.user.email, "signin", code);
    } catch {
      response.status(503).json({ error: "Sign-in email is temporarily unavailable" });
      return;
    }
  }
  response.status(202).json({ codeRequired: true });
});

router.post("/signin/code", authRateLimit, async (request, response) => {
  const input = emailCodeSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: "A valid email and six-digit code are required" });
    return;
  }

  const user = await consumeChallenge(input.data.email, input.data.code, "signin");
  if (!user) {
    response.status(401).json({ error: "Invalid or expired sign-in code" });
    return;
  }

  const authentication = await createAuthentication(user);
  response.setHeader("Set-Cookie", refreshTokenCookie(authentication.refreshToken));
  response.json(authentication.body);
});

export { router as signin };
