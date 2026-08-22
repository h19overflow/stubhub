import express from "express";
import { createUser, issueChallenge, readCredentials } from "../auth-repo.js";
import { sendCode } from "../email.js";

const router = express.Router();

router.post("/signup", async (request, response) => {
  const credentials = readCredentials(request.body);
  if (!credentials) {
    response.status(400).json({ error: "A valid email and password of 8 to 256 characters are required" });
    return;
  }

  const user = await createUser(credentials);
  if (!user) {
    response.status(409).json({ error: "Email is already registered" });
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
