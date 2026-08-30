import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

type Migration = {
  version: number;
  name: string;
  sql: string;
  checksum: string;
};

type AppliedMigration = {
  version: number;
  name: string;
  checksum: string;
};

const migrationsPath = fileURLToPath(new URL("../migrations/", import.meta.url));
const defaultPath = fileURLToPath(new URL("../data/moderation.sqlite", import.meta.url));
const databasePath = process.env.MODERATION_DB_PATH ?? defaultPath;
if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

/**
 * Loads numbered Moderation migrations and verifies their contiguous versions.
 */
function loadMigrations(): Migration[] {
  const migrations: Migration[] = [];
  for (const name of readdirSync(migrationsPath).filter((file) => file.endsWith(".sql")).sort()) {
    const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name);
    if (!match) throw new Error(`Invalid Moderation migration filename: ${name}`);
    const sql = readFileSync(resolve(migrationsPath, name), "utf8");
    migrations.push({
      version: Number(match[1]),
      name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    });
  }

  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Moderation migrations must be contiguous; expected version ${index + 1}`);
    }
  });
  return migrations;
}

/**
 * Applies pending Moderation migrations and rejects a changed applied migration.
 */
function runMigrations(database: DatabaseSync): { applied: number; total: number } {
  const migrations = loadMigrations();
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `);

  const applied = database.prepare(`
    SELECT version, name, checksum
    FROM schema_migrations
    ORDER BY version
  `).all() as AppliedMigration[];
  applied.forEach((recorded, index) => {
    if (recorded.version !== index + 1) {
      throw new Error(`Moderation migration ledger has a gap before version ${recorded.version}`);
    }
  });
  for (const recorded of applied) {
    const migration = migrations.find(({ version }) => version === recorded.version);
    if (!migration) throw new Error(`Applied Moderation migration ${recorded.version} is missing`);
    if (migration.name !== recorded.name || migration.checksum !== recorded.checksum) {
      throw new Error(`Applied Moderation migration ${recorded.version} was modified`);
    }
  }

  let appliedNow = 0;
  for (const migration of migrations.slice(applied.length)) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration.sql);
      database.prepare(`
        INSERT INTO schema_migrations (version, name, checksum, applied_at)
        VALUES (?, ?, ?, ?)
      `).run(migration.version, migration.name, migration.checksum, Date.now());
      database.exec(`PRAGMA user_version = ${migration.version}`);
      database.exec("COMMIT");
      appliedNow += 1;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  return { applied: appliedNow, total: migrations.length };
}

// One process-wide connection keeps report writes transactionally serialized.
const database = new DatabaseSync(databasePath, { timeout: 5_000 });
database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
const migrationResult = runMigrations(database);

/**
 * Runs a Moderation write in one SQLite transaction, rolling back on errors.
 */
function withTransaction<T>(work: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  console.log(
    `Moderation database is current: ${migrationResult.total} migrations, ${migrationResult.applied} applied`,
  );
}

export { database, withTransaction };
