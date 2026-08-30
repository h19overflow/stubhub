import express from "express";
import { HttpError } from "../error-handler.js";
import { issueChallenge } from "../../challenges/email-challenge-repo.js";
import { createUser } from "../../users/user-repo.js";
import { sendCode } from "../../email/challenge-email.js";
import { emailCodesDisabled } from "../../email/email-code-policy.js";
import { authRateLimit } from "../rate-limit.js";
import { credentialsSchema } from "../schemas.js";

const router = express.Router();

/**
 * POST /signup — creates an unverified user and sends a verification code.
 *
 * Flow: validate via credentialsSchema → createUser (409 if email taken) →
 * if emailCodesDisabled return 201 without code; else issueChallenge
 * (verify_email, 1/min cooldown) → sendCode (swallowed on SMTP failure) →
 * always 201 with {user, verificationRequired, emailSent}. Rate-limited
 * (authRateLimit 15/min). Throws HttpError handled by errorHandler.
 */
router.post("/signup", authRateLimit, async (request, response) => {
  const result = credentialsSchema.safeParse(request.body);
  if (!result.success) {
    // Express 5 catches this throw, including inside an async route, and calls errorHandler.
    throw new HttpError(400, "A valid email and password of 8 to 256 characters are required");
  }

  const user = await createUser(result.data, emailCodesDisabled);
  if (!user) {
    throw new HttpError(409, "Email is already registered");
  }
  if (emailCodesDisabled) {
    response.status(201).json({ user, verificationRequired: false, emailSent: false });
    return;
  }

  const code = await issueChallenge(user, "verify_email");
  let emailSent = false;
  if (code) {
    try {
      await sendCode(user.email, "verify_email", code);
      emailSent = true;
    } catch {
      // ponytail: the resend endpoint is recovery; add an outbox when guaranteed delivery matters.
    }
  }

  response.status(201).json({ user, verificationRequired: true, emailSent });
});

export { router as signup };
