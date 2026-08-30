import express from "express";
import { consumeChallenge, issueChallenge } from "../../challenges/email-challenge-repo.js";
import { createAuthentication } from "../../tokens/authentication.js";
import { refreshTokenCookie } from "../../tokens/refresh-token-cookie.js";
import { findUserByEmail } from "../../users/user-repo.js";
import { sendCode } from "../../email/challenge-email.js";
import { emailCodeSchema, emailSchema } from "../schemas.js";

const router = express.Router();

/**
 * POST /verify-email/request — resends a verification code (generic response).
 *
 * Flow: validates email → findUserByEmail (if unverified) → issueChallenge
 * with cooldown → sendCode (errors swallowed to avoid email enumeration) →
 * always 202 {message}. Prevents account disclosure via uniform response.
 */
router.post("/verify-email/request", async (request, response) => {
  const input = emailSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: "A valid email is required" });
    return;
  }

  const user = findUserByEmail(input.data.email);
  if (user && !user.emailVerified) {
    const code = await issueChallenge(user, "verify_email");
    if (code) {
      try {
        await sendCode(user.email, "verify_email", code);
      } catch {
        // Keep the response generic so this endpoint does not disclose registered emails.
      }
    }
  }

  response.status(202).json({ message: "If verification is available, a code has been sent" });
});

/**
 * POST /verify-email — consumes a 6-digit code and creates an auth session.
 *
 * Flow: validates {email,code} via emailCodeSchema → consumeChallenge
 * (verify_email, checks hash/expiry/attempts, sets email_verified_at) →
 * on failure 400; on success createAuthentication (JWT + family refresh token)
 * → Set-Cookie refreshToken (HttpOnly) → 200 {user,accessToken,expiresIn}.
 */
router.post("/verify-email", async (request, response) => {
  const input = emailCodeSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: "A valid email and six-digit code are required" });
    return;
  }

  const user = await consumeChallenge(input.data.email, input.data.code, "verify_email");
  if (!user) {
    response.status(400).json({ error: "Invalid or expired verification code" });
    return;
  }

  const authentication = await createAuthentication(user);
  response.setHeader("Set-Cookie", refreshTokenCookie(authentication.refreshToken));
  response.json(authentication.body);
});

export { router as verifyEmail };
