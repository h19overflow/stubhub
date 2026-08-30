import express from "express";
import { consumeChallenge, issueChallenge } from "../../challenges/email-challenge-repo.js";
import { createAuthentication } from "../../tokens/authentication.js";
import { refreshTokenCookie } from "../../tokens/refresh-token-cookie.js";
import { authenticateUser } from "../../users/user-repo.js";
import { sendCode } from "../../email/challenge-email.js";
import { emailCodesDisabled } from "../../email/email-code-policy.js";
import { authRateLimit } from "../rate-limit.js";
import { credentialsSchema, emailCodeSchema } from "../schemas.js";

const router = express.Router();

/**
 * POST /signin — password check + either immediate auth or 2nd-factor code.
 *
 * Flow: credentialsSchema → authenticateUser (invalid→401, locked→429+Retry-After,
 * unverified→403) → if emailCodesDisabled createAuthentication+cookie 200; else
 * issueChallenge(signin) → sendCode → 202 {codeRequired:true} (1/min cooldown).
 * 503 if SMTP fails after successful auth. Rate-limited.
 */
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
  if (emailCodesDisabled) {
    const authentication = await createAuthentication(result.user);
    response.setHeader("Set-Cookie", refreshTokenCookie(authentication.refreshToken));
    response.status(200).json(authentication.body);
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

/**
 * POST /signin/code — verifies signin OTP and issues auth session.
 *
 * Flow: emailCodeSchema → consumeChallenge(signin) → 401 on bad/expired →
 * createAuthentication → Set-Cookie refreshToken → 200 auth body. Completes
 * the two-step signin. Rate-limited.
 */
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
