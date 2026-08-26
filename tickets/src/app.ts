import express from "express";
import { errorHandler } from "./http/error-handler.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_request, response) => {
  response.json({ service: "tickets", status: "ok" });
});

app.use(errorHandler);

export { app };
