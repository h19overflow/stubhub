import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { runSqliteMigrations, withSqliteTransaction } from "@stubhub/common";

const migrationsPath = fileURLToPath(new URL("../migrations/", import.meta.url));
const defaultPath = fileURLToPath(new URL("../data/orders.sqlite", import.meta.url));
const databasePath = process.env.ORDERS_DB_PATH ?? defaultPath;
if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

// SQLite is embedded: one process-wide connection is safer than a pool of competing writers.
const database = new DatabaseSync(databasePath, { timeout: 5_000 });
database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
const migrationResult = runSqliteMigrations({
  database,
  migrationsPath,
  serviceName: "Orders",
  legacyTableName: "orders",
});

/**
 * Runs Orders work on the module-level shared Orders SQLite connection with
 * `BEGIN IMMEDIATE`, `COMMIT`, and `ROLLBACK` on error.
 */
function withTransaction<T>(work: () => T): T {
  return withSqliteTransaction(database, work);
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  console.log(
    `Orders database is current: ${migrationResult.total} migrations, ${migrationResult.applied} applied`,
  );
}


export { database, withTransaction };
