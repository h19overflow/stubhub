import express from "express";
import {
  authenticateUser,
  consumeChallenge,
  createSession,
  issueChallenge,
  readCredentials,
  readEmailCode,
  sessionCookie,
} from "../auth-repo.js";
import { sendCode } from "../email.js";

const router = express.Router();

router.post("/signin", async (request, response) => {
  const credentials = readCredentials(request.body);
  if (!credentials) {
    response.status(400).json({ error: "A valid email and password of 8 to 256 characters are required" });
    return;
  }

  const result = await authenticateUser(credentials);
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

router.post("/signin/code", async (request, response) => {
  const input = readEmailCode(request.body);
  if (!input) {
    response.status(400).json({ error: "A valid email and six-digit code are required" });
    return;
  }

  const user = await consumeChallenge(input.email, input.code, "signin");
  if (!user) {
    response.status(401).json({ error: "Invalid or expired sign-in code" });
    return;
  }

  const token = createSession(user.id);
  response.setHeader("Set-Cookie", sessionCookie(token));
  response.json({ user });
});

export { router as signin };
