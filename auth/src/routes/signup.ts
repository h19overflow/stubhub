import express from "express";
import { HttpError } from "../error-handler.js";
import { createUser, issueChallenge } from "../auth-repo.js";
import { sendCode } from "../email.js";
import { authRateLimit } from "../rate-limit.js";
import { credentialsSchema } from "./schemas.js";

const router = express.Router();

router.post("/signup", authRateLimit, async (request, response) => {
  const result = credentialsSchema.safeParse(request.body);
  if (!result.success) {
    // Express 5 catches this throw, including inside an async route, and calls errorHandler.
    throw new HttpError(400, "A valid email and password of 8 to 256 characters are required");
  }

  const user = await createUser(result.data);
  if (!user) {
    throw new HttpError(409, "Email is already registered");
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
