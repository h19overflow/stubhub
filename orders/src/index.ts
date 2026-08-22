import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3003);

app.disable("x-powered-by");

app.get("/health", (_request, response) => {
  response.json({ service: "orders", status: "ok" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Orders service listening on port ${port}`);
});
