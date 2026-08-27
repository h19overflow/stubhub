import { requireAuth } from "@stubhub/common";
import express from "express";

const router = express.Router();

router.get("/current-user", requireAuth, (_request, response) => {
  response.json({ user: response.locals.user });
});

export { router as currentUser };
