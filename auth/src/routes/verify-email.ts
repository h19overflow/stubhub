import express from "express";
import {
  consumeChallenge,
  createSession,
  findUserByEmail,
  issueChallenge,
  readEmail,
  readEmailCode,
  sessionCookie,
} from "../auth-repo.js";
import { sendCode } from "../email.js";

const router = express.Router();

router.post("/verify-email/request", async (request, response) => {
  const email = readEmail(request.body);
  if (!email) {
    response.status(400).json({ error: "A valid email is required" });
    return;
  }

  const user = findUserByEmail(email);
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

router.post("/verify-email", async (request, response) => {
  const input = readEmailCode(request.body);
  if (!input) {
    response.status(400).json({ error: "A valid email and six-digit code are required" });
    return;
  }

  const user = await consumeChallenge(input.email, input.code, "verify_email");
  if (!user) {
    response.status(400).json({ error: "Invalid or expired verification code" });
    return;
  }

  const token = createSession(user.id);
  response.setHeader("Set-Cookie", sessionCookie(token));
  response.json({ user });
});

export { router as verifyEmail };
