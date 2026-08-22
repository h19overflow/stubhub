import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.disable("x-powered-by");

app.get("/health", (_request, response) => {
  response.json({ service: "identity", status: "ok" });
});

app.get("/api/users/currentuser", (_request, response) => {
  response.json({ id: 1, username: "john_doe" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Identity service listening on port ${port}`);
});
