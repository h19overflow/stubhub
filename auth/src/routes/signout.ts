import express from "express";
import { clearSessionCookie, revokeSession } from "../auth-repo.js";

const router = express.Router();

router.post("/signout", (request, response) => {
  revokeSession(request.headers.cookie);
  response.setHeader("Set-Cookie", clearSessionCookie());
  response.status(204).send();
});

export { router as signout };
