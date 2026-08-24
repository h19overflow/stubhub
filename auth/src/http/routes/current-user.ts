import express from "express";
import { verifyAccessToken } from "../../tokens/access-token.js";

const router = express.Router();

router.get("/current-user", async (request, response) => {
  const user = await verifyAccessToken(request.headers.authorization);
  if (!user) {
    response.setHeader("WWW-Authenticate", "Bearer");
    response.status(401).json({ error: "Authentication required" });
    return;
  }
  response.json({ user });
});

export { router as currentUser };
