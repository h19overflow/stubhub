import express from "express";
import { requireAuth } from "../require-auth.js";

const router = express.Router();

router.get("/current-user", requireAuth, (_request, response) => {
  response.json({ user: response.locals.user });
});

export { router as currentUser };
