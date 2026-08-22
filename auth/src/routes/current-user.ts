import express from "express";
import { currentUser } from "../auth-repo.js";

const router = express.Router();

router.get("/current-user", (request, response) => {
  response.json({ user: currentUser(request.headers.cookie) });
});

export { router as currentUser };
