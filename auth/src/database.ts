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
const defaultPath = fileURLToPath(new URL("../data/identity.sqlite", import.meta.url));
const databasePath = process.env.IDENTITY_DB_PATH ?? defaultPath;
if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

/**
 * Loads numbered SQL migrations from disk and validates their contract.
 *
 * Flow: called once at startup by runMigrations(). Reads migrations/*.sql sorted
 * lexicographically, enforces 001_name.sql naming, computes sha256 checksum,
 * and checks contiguity (1..N). Checksum is later used to detect tampering
 * with already-applied migrations. Throws on gap or bad filename.
 */
function loadMigrations(): Migration[] {
  const migrations: Migration[] = [];
  for (const name of readdirSync(migrationsPath).filter((file) => file.endsWith(".sql")).sort()) {
    const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name);
    if (!match) throw new Error(`Invalid Identity migration filename: ${name}`);
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
      throw new Error(`Identity migrations must be contiguous; expected version ${index + 1}`);
    }
  });
  return migrations;
}

/**
 * Backfills schema_migrations for DBs that used PRAGMA user_version before ledger existed.
 *
 * Flow: runMigrations() calls this before normal migration. If schema_migrations
 * is empty but user_version>0 and users table exists, inserts ledger rows for
 * migrations 1..user_version so future runs use the ledger. No-op on fresh or
 * already-migrated DBs. Uses BEGIN IMMEDIATE to avoid races.
 */
function adoptLegacyVersion(database: DatabaseSync, migrations: Migration[]): void {
  const { user_version: legacyVersion } = database.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  const { count } = database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as {
    count: number;
  };
  if (legacyVersion === 0 || count !== 0) return;
  if (legacyVersion > migrations.length) {
    throw new Error(`Identity database version ${legacyVersion} has no matching migration files`);
  }
  if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()) {
    throw new Error("Identity database has a legacy version but no users table");
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
 * Ensures Identity SQLite schema is current; creates ledger and applies pending migrations.
 *
 * Flow: startup -> creates schema_migrations table -> adoptLegacyVersion() ->
 * validates already-applied rows (gap/checksum/name checks) -> applies remaining
 * migrations each in a transaction (exec sql, insert ledger, bump user_version).
 * Returns {applied,total} for logging. Idempotent and crash-safe per-migration.
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
  adoptLegacyVersion(database, migrations);

  const applied = database.prepare(`
    SELECT version, name, checksum
    FROM schema_migrations
    ORDER BY version
  `).all() as AppliedMigration[];
  applied.forEach((recorded, index) => {
    if (recorded.version !== index + 1) {
      throw new Error(`Identity migration ledger has a gap before version ${recorded.version}`);
    }
  });
  for (const recorded of applied) {
    const migration = migrations.find(({ version }) => version === recorded.version);
    if (!migration) throw new Error(`Applied Identity migration ${recorded.version} is missing`);
    if (migration.name !== recorded.name || migration.checksum !== recorded.checksum) {
      throw new Error(`Applied Identity migration ${recorded.version} was modified`);
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

// SQLite is embedded: one process-wide connection is safer than a pool of competing writers.
const database = new DatabaseSync(databasePath, { timeout: 5_000 });
database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
const migrationResult = runMigrations(database);

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  console.log(
    `Identity database is current: ${migrationResult.total} migrations, ${migrationResult.applied} applied`,
  );
}

export { database };
