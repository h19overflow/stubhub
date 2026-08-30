import express from "express";
import { errorHandler } from "./http/error-handler.js";
import { adminUsers } from "./http/routes/admin-users.js";
import { currentUser } from "./http/routes/current-user.js";
import { internalUsers } from "./http/routes/internal-users.js";
import { refresh } from "./http/routes/refresh.js";
import { signin } from "./http/routes/signin.js";
import { signout } from "./http/routes/signout.js";
import { signup } from "./http/routes/signup.js";
import { verifyEmail } from "./http/routes/verify-email.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_request, response) => {
  response.json({ service: "identity", status: "ok" });
});

app.use(internalUsers, adminUsers, currentUser, refresh, signin, signout, signup, verifyEmail);
// Error middleware belongs after every route so thrown route errors reach it.
app.use(errorHandler);

export { app };
