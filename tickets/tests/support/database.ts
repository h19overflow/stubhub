import { database } from "../../src/database.js";

function resetDatabase(): void {
  database.prepare("DELETE FROM tickets").run();
}

export { resetDatabase };
