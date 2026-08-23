import express from "express";
import { errorHandler } from "./error-handler.js";
import { currentUser } from "./routes/current-user.js";
import { refresh } from "./routes/refresh.js";
import { signin } from "./routes/signin.js";
import { signout } from "./routes/signout.js";
import { signup } from "./routes/signup.js";
import { verifyEmail } from "./routes/verify-email.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_request, response) => {
  response.json({ service: "identity", status: "ok" });
});

app.use(currentUser, refresh, signin, signout, signup, verifyEmail);
// Error middleware belongs after every route so thrown route errors reach it.
app.use(errorHandler);
app.listen(port, "0.0.0.0", () => {
  console.log(`Identity service listening on port ${port}`);
});
