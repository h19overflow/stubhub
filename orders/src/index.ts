import { app } from "./app.js";

const port = Number(process.env.PORT ?? 3003);

app.listen(port, "0.0.0.0", () => {
  console.log(`Orders service listening on port ${port}`);
});
