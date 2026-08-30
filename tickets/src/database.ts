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
const defaultPath = fileURLToPath(
  new URL("../data/tickets.sqlite", import.meta.url),
);
const databasePath = process.env.TICKETS_DB_PATH ?? defaultPath;
if (databasePath !== ":memory:") {
  mkdirSync(dirname(databasePath), { recursive: true });
}

/**
 * Loads Tickets SQL migrations from disk with checksum validation.
 *
 * Flow: runMigrations startup helper. Reads migrations/*.sql, enforces
 * 001_name.sql naming, sha256 checksum, contiguity 1..N. Used to detect
 * tampered applied migrations later.
 */
function loadMigrations(): Migration[] {
  const migrations: Migration[] = [];
  for (const name of readdirSync(migrationsPath)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name);
    if (!match) {
      throw new Error(`Invalid Tickets migration filename: ${name}`);
    }
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
      throw new Error(`Tickets migrations must be contiguous; expected version ${index + 1}`);
    }
  });
  return migrations;
}

/**
 * Backfills schema_migrations from legacy PRAGMA user_version for Tickets DB.
 *
 * Flow: see auth/database counterpart; checks tickets table existence instead
 * of users. Inserts ledger rows for 1..user_version so new ledger takes over.
 */
function adoptLegacyVersion(
  database: DatabaseSync,
  migrations: Migration[],
): void {
  const { user_version: legacyVersion } = database
    .prepare("PRAGMA user_version")
    .get() as {
      user_version: number;
    };
  const { count } = database
    .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
    .get() as {
      count: number;
    };
  if (legacyVersion === 0 || count !== 0) {
    return;
  }
  if (legacyVersion > migrations.length) {
    throw new Error(
      `Tickets database version ${legacyVersion} has no matching migration files`,
    );
  }
  const ticketsTable = database
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tickets'",
    )
    .get();
  if (!ticketsTable) {
    throw new Error(
      "Tickets database has a legacy version but no tickets table",
    );
  }

  const record = database.prepare(`
    INSERT INTO schema_migrations (version, name, checksum, applied_at)
    VALUES (?, ?, ?, ?)
  `);
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const migration of migrations.slice(0, legacyVersion)) {
      record.run(migration.version, migration.name, migration.checksum, Date.now());
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Brings Tickets SQLite to current schema (ledger + pending migrations).
 *
 * Flow: startup -> create schema_migrations -> adoptLegacyVersion -> validate
 * applied (gap/checksum/name) -> apply remaining each in BEGIN IMMEDIATE
 * transaction. Returns {applied,total}. Single process-wide connection (WAL).
 */
function runMigrations(
  database: DatabaseSync,
): { applied: number; total: number } {
  const migrations = loadMigrations();
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `);
  adoptLegacyVersion(database, migrations);

  const applied = database
    .prepare(
      `SELECT version, name, checksum
       FROM schema_migrations
       ORDER BY version`,
    )
    .all() as AppliedMigration[];
  applied.forEach((recorded, index) => {
    if (recorded.version !== index + 1) {
      throw new Error(
        `Tickets migration ledger has a gap before version ${recorded.version}`,
      );
    }
  });
  for (const recorded of applied) {
    const migration = migrations.find(
      ({ version }) => version === recorded.version,
    );
    if (!migration) {
      throw new Error(
        `Applied Tickets migration ${recorded.version} is missing`,
      );
    }
    if (
      migration.name !== recorded.name ||
      migration.checksum !== recorded.checksum
    ) {
      throw new Error(
        `Applied Tickets migration ${recorded.version} was modified`,
      );
    }
  }

  let appliedNow = 0;
  for (const migration of migrations.slice(applied.length)) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration.sql);
      database
        .prepare(
          `INSERT INTO schema_migrations (
             version,
             name,
             checksum,
             applied_at
           ) VALUES (?, ?, ?, ?)`,
        )
        .run(
          migration.version,
          migration.name,
          migration.checksum,
          Date.now(),
        );
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

// SQLite is embedded: one process-wide connection is safer than a pool of competing writers.
const database = new DatabaseSync(databasePath, { timeout: 5_000 });
database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
const migrationResult = runMigrations(database);

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  console.log(
    `Tickets database is current: ${migrationResult.total} migrations, ${migrationResult.applied} applied`,
  );
}

export { database };
