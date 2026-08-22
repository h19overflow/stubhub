import express from "express";
import { currentUser } from "./routes/current-user.js";
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

app.use(currentUser, signin, signout, signup, verifyEmail);
app.listen(port, "0.0.0.0", () => {
  console.log(`Identity service listening on port ${port}`);
});
